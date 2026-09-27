import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Pencil, RefreshCw, Trash2, Plus, Upload, FileUp } from "lucide-react";
import { Loader2 } from "@/components/BrandLoader";
import { generateComprehensiveAptitudeQuestions } from "@/lib/assessmentGenerator";
import { sendStageEmail } from "@/lib/stageEmail";
import { parsePdfQuestions } from "@/lib/pdfQuestionParser";

interface Question {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  time_seconds: number;
}

interface Section {
  name: string;
  questions: Question[];
}

const difficultyColors: Record<string, string> = {
  easy: "bg-primary/10 text-primary",
  medium: "bg-amber-500/10 text-amber-500",
  hard: "bg-destructive/10 text-destructive",
};

const ReviewAssessment = () => {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<string>("hr");

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [approving, setApproving] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editDialog, setEditDialog] = useState<{ sectionIdx: number; questionIdx: number } | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);

  // Add question dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState<Question>({
    question_number: 0,
    question: "",
    options: ["", "", "", ""],
    correct_answer: "A",
    difficulty: "medium",
    time_seconds: 60,
  });
  const [addSection, setAddSection] = useState("");

  // Regenerate reason dialog
  const [regenDialog, setRegenDialog] = useState<{ sectionIdx: number; questionIdx: number } | null>(null);
  const [regenReason, setRegenReason] = useState("");

  useEffect(() => {
    fetchAssessment();
    // Detect user role for navigation
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from("users").select("role").eq("user_id", session.user.id).maybeSingle();
        if (data?.role) setUserRole(data.role);
      }
    })();
  }, [assessmentId]);

  const fetchAssessment = async () => {
    if (!assessmentId) return;

    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", assessmentId)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Error", description: "Assessment not found", variant: "destructive" });
      navigate(userRole === "manager" ? "/manager-dashboard" : "/hr-dashboard");
      return;
    }

    setAssessment(data);

    // Get job title
    const { data: job } = await supabase.from("jobs").select("title, skills_required").eq("id", data.job_id).maybeSingle();
    if (job) setJobTitle(job.title);

    const questions = data.questions as any;
    if (questions?.sections && Array.isArray(questions.sections) && questions.sections.length > 0) {
      setSections(questions.sections);
    } else {
      const skills = Array.isArray(job?.skills_required) ? job.skills_required : [];
      const generated = generateComprehensiveAptitudeQuestions(job?.title || "Software Engineer", skills);
      setSections(generated.sections);
      await supabase
        .from("assessments")
        .update({ questions: JSON.parse(JSON.stringify(generated)) })
        .eq("id", assessmentId);
    }

    // Get candidate name
    const { data: app } = await supabase.from("applications").select("candidate_id").eq("id", data.application_id).maybeSingle();
    if (app) {
      const { data: user } = await supabase.from("users").select("full_name").eq("id", app.candidate_id).maybeSingle();
      if (user) setCandidateName(user.full_name);
    }

    setLoading(false);
  };

  const saveQuestions = async (newSections: Section[]) => {
    setSections(newSections);
    await supabase
      .from("assessments")
      .update({ questions: JSON.parse(JSON.stringify({ sections: newSections })) })
      .eq("id", assessmentId);
  };

  const handleEdit = (sectionIdx: number, questionIdx: number) => {
    const q = sections[sectionIdx].questions[questionIdx];
    setEditForm({ ...q });
    setEditDialog({ sectionIdx, questionIdx });
  };

  const saveEdit = async () => {
    if (!editDialog || !editForm) return;
    const newSections = [...sections];
    newSections[editDialog.sectionIdx].questions[editDialog.questionIdx] = editForm;
    await saveQuestions(newSections);
    setEditDialog(null);
    toast({ title: "Saved", description: "Question updated." });
  };

  const handleRemove = async (sectionIdx: number, questionIdx: number) => {
    const newSections = [...sections];
    newSections[sectionIdx].questions.splice(questionIdx, 1);
    await saveQuestions(newSections);
    toast({ title: "Removed", description: "Question removed." });
  };

  const handleRegenerate = async () => {
    if (!regenDialog) return;
    const { sectionIdx, questionIdx } = regenDialog;
    const globalIdx = sections.slice(0, sectionIdx).reduce((sum, s) => sum + s.questions.length, 0) + questionIdx;
    const key = `${sectionIdx}-${questionIdx}`;
    setRegeneratingIdx(key);
    setRegenDialog(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-assessment", {
        body: {
          jobId: assessment.job_id,
          regenerateIndex: globalIdx,
          feedback: regenReason || "Not relevant",
        },
      });

      if (error) throw error;

      if (data?.question) {
        const newSections = [...sections];
        newSections[sectionIdx].questions[questionIdx] = data.question;
        await saveQuestions(newSections);
        toast({ title: "Regenerated", description: "New question generated." });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to regenerate", variant: "destructive" });
    }
    setRegeneratingIdx(null);
    setRegenReason("");
  };

  const handleAddQuestion = async () => {
    if (!addSection || !addForm.question) return;
    const sectionIdx = sections.findIndex((s) => s.name === addSection);
    if (sectionIdx === -1) return;

    const newSections = [...sections];
    newSections[sectionIdx].questions.push({
      ...addForm,
      question_number: newSections[sectionIdx].questions.length + 1,
    });
    await saveQuestions(newSections);
    setAddDialog(false);
    setAddForm({ question_number: 0, question: "", options: ["", "", "", ""], correct_answer: "A", difficulty: "medium", time_seconds: 60 });
    toast({ title: "Added", description: "Question added." });
  };

  const handleRegenerateAll = async () => {
    setRegeneratingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-assessment", {
        body: {
          jobId: assessment.job_id,
          applicationId: assessment.application_id,
          companyId: assessment.company_id,
          createdBy: assessment.created_by,
        },
      });

      if (!error && data?.questions?.sections) {
        await saveQuestions(data.questions.sections);
        toast({ title: "Regenerated All", description: "40 new questions generated by AI." });
      } else {
        const fallback = generateComprehensiveAptitudeQuestions(jobTitle || "Software Engineer");
        await saveQuestions(fallback.sections);
        toast({ title: "Regenerated All", description: "40 aptitude questions refreshed." });
      }
    } catch (e: any) {
      console.warn("Edge function regenerate error, using client fallback:", e);
      const fallback = generateComprehensiveAptitudeQuestions(jobTitle || "Software Engineer");
      await saveQuestions(fallback.sections);
      toast({ title: "Regenerated All", description: "40 aptitude questions refreshed." });
    }
    setRegeneratingAll(false);
  };

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Invalid File", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }

    setUploadingPdf(true);
    toast({ title: "📄 Processing PDF...", description: "AI is extracting and converting questions from your PDF." });

    try {
      const result = await parsePdfQuestions(file, {
        jobId: assessment?.job_id,
        jobTitle: jobTitle || "Software Engineer",
      });

      if (result.sections && result.sections.length > 0) {
        // Merge uploaded questions into existing sections or replace
        const newSections = [...sections];
        for (const uploadedSection of result.sections) {
          const existingIdx = newSections.findIndex(
            (s) => s.name.toLowerCase() === uploadedSection.name.toLowerCase()
          );
          if (existingIdx !== -1) {
            // Add to existing section
            const startNum = newSections[existingIdx].questions.length + 1;
            const numberedQuestions = uploadedSection.questions.map((q: any, i: number) => ({
              ...q,
              question_number: startNum + i,
            }));
            newSections[existingIdx].questions.push(...numberedQuestions);
          } else {
            // Add as new section
            newSections.push(uploadedSection as any);
          }
        }
        await saveQuestions(newSections);
        const totalExtracted = result.sections.reduce((sum: number, s: any) => sum + s.questions.length, 0);
        toast({
          title: "✅ PDF Questions Added!",
          description: `${totalExtracted} questions extracted and added.`,
        });
      }
    } catch (e: any) {
      console.error("ReviewAssessment PDF parsing error:", e);
      toast({ title: "Error", description: e.message || "Failed to process PDF", variant: "destructive" });
    }

    setUploadingPdf(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      let currentSecs = sections;
      if (!currentSecs || currentSecs.length === 0 || currentSecs.reduce((sum, s) => sum + s.questions.length, 0) === 0) {
        const generated = generateComprehensiveAptitudeQuestions(jobTitle || "Software Engineer");
        currentSecs = generated.sections;
        setSections(currentSecs);
      }

      // Update assessment status and persist questions
      const { error: assessErr } = await supabase
        .from("assessments")
        .update({
          questions: JSON.parse(JSON.stringify({ sections: currentSecs })),
          status: "approved",
          hr_approved: true,
          approved_at: new Date().toISOString(),
          manager_approved: true,
          manager_approved_at: new Date().toISOString(),
        })
        .eq("id", assessmentId);

      if (assessErr) {
        console.warn("Notice: assessment status update warning:", assessErr);
      }

      // Update application stage and status
      const { error: appErr } = await supabase
        .from("applications")
        .update({
          current_stage: "aptitude_test",
          status: "active",
        })
        .eq("id", assessment.application_id);

      if (appErr) {
        console.error("Error updating application stage:", appErr);
        throw new Error(appErr.message || "Failed to update candidate application stage");
      }

      // Get candidate details for notification and email
      const { data: app } = await supabase
        .from("applications")
        .select("id, candidate_id, candidate_name, candidate_email, job_title")
        .eq("id", assessment.application_id)
        .maybeSingle();

      if (app?.candidate_id) {
        // Send in-app notification safely
        try {
          await supabase.from("notifications").insert({
            user_id: app.candidate_id,
            title: "🎉 You are shortlisted for the Aptitude Test!",
            message: `Congratulations! Your resume for "${jobTitle || app.job_title || "the position"}" has been reviewed and you are selected for the Aptitude Test round. Login to your dashboard to take your test within 48 hours.`,
          });
        } catch (notifErr) {
          console.warn("Notification insert warning:", notifErr);
        }

        // Send stage transition email safely
        try {
          sendStageEmail({
            applicationId: assessment.application_id,
            event: "shortlisted",
            stage: "applied",
            nextStage: "aptitude_test",
          });
        } catch (emailErr) {
          console.warn("Email warning:", emailErr);
        }
      }

      toast({
        title: "✅ Test Sent to Candidate!",
        description: `${candidateName || "The candidate"} can now access and complete their Aptitude Test.`,
      });
      navigate(userRole === "manager" ? "/manager-dashboard" : "/hr-dashboard");
    } catch (e: any) {
      console.error("handleApprove error:", e);
      toast({ title: "Error", description: e.message || "Failed to send test to candidate", variant: "destructive" });
    }
    setApproving(false);
  };

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const totalTime = sections.reduce((sum, s) => sum + s.questions.reduce((qs, q) => qs + (q.time_seconds || 60), 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(userRole === "manager" ? "/manager-dashboard" : "/hr-dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Review Assessment — {jobTitle}</h1>
              <p className="text-sm text-muted-foreground">Candidate: {candidateName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              onChange={handleUploadPdf}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf}
            >
              {uploadingPdf ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4 mr-1" />
              )}
              {uploadingPdf ? "Processing..." : "Upload PDF"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Question
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateAll}
              disabled={regeneratingAll}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${regeneratingAll ? "animate-spin" : ""}`} />
              {regeneratingAll ? "Generating..." : "Regenerate All"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Sections */}
        {sections.map((section, sIdx) => (
          <motion.div
            key={sIdx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sIdx * 0.1 }}
            className="rounded-xl border border-border bg-card"
          >
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">{section.name} ({section.questions.length} questions)</h2>
            </div>

            <div className="divide-y divide-border">
              {section.questions.map((q, qIdx) => {
                const key = `${sIdx}-${qIdx}`;
                const isRegenerating = regeneratingIdx === key;
                const correctIdx = q.correct_answer.charCodeAt(0) - 65;

                return (
                  <div key={qIdx} className={`p-5 ${isRegenerating ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-muted-foreground">Q{q.question_number || qIdx + 1}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${difficultyColors[q.difficulty] || "bg-muted text-muted-foreground"}`}>
                            {q.difficulty}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{q.time_seconds}s</span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-3">{q.question}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`text-sm px-3 py-2 rounded-lg border ${
                                oIdx === correctIdx
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              <span className="font-bold mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(sIdx, qIdx)} className="text-xs gap-1 h-7">
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setRegenDialog({ sectionIdx: sIdx, questionIdx: qIdx }); setRegenReason(""); }}
                          disabled={isRegenerating}
                          className="text-xs gap-1 h-7"
                        >
                          <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} /> Regen
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRemove(sIdx, qIdx)} className="text-xs gap-1 h-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Summary & Approve */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground mb-4">Summary</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">{totalQuestions}</p>
              <p className="text-xs text-muted-foreground">Total Questions</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">{Math.round(totalTime / 60)} min</p>
              <p className="text-xs text-muted-foreground">Total Time</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">{sections.length}</p>
              <p className="text-xs text-muted-foreground">Sections</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 bg-primary text-primary-foreground h-12 text-base"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {approving ? "Approving..." : "✅ APPROVE AND SEND TO CANDIDATE"}
            </Button>
            <Button
              variant="outline"
              onClick={handleRegenerateAll}
              disabled={regeneratingAll}
              className="h-12"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${regeneratingAll ? "animate-spin" : ""}`} />
              🔄 Regenerate All
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Question Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <Textarea
                value={editForm.question}
                onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                placeholder="Question text"
                rows={3}
              />
              {editForm.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-muted-foreground w-6">{String.fromCharCode(65 + i)}.</span>
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...editForm.options];
                      newOpts[i] = e.target.value;
                      setEditForm({ ...editForm, options: newOpts });
                    }}
                  />
                </div>
              ))}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Correct Answer</label>
                  <Select value={editForm.correct_answer} onValueChange={(v) => setEditForm({ ...editForm, correct_answer: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Difficulty</label>
                  <Select value={editForm.difficulty} onValueChange={(v) => setEditForm({ ...editForm, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Your Own Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Section</label>
              <Select value={addSection} onValueChange={setAddSection}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={addForm.question}
              onChange={(e) => setAddForm({ ...addForm, question: e.target.value })}
              placeholder="Question text"
              rows={3}
            />
            {addForm.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted-foreground w-6">{String.fromCharCode(65 + i)}.</span>
                <Input
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...addForm.options];
                    newOpts[i] = e.target.value;
                    setAddForm({ ...addForm, options: newOpts });
                  }}
                />
              </div>
            ))}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Correct Answer</label>
                <Select value={addForm.correct_answer} onValueChange={(v) => setAddForm({ ...addForm, correct_answer: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Difficulty</label>
                <Select value={addForm.difficulty} onValueChange={(v) => setAddForm({ ...addForm, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleAddQuestion} className="w-full" disabled={!addSection || !addForm.question}>
              Add Question
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Reason Dialog */}
      <Dialog open={!!regenDialog} onOpenChange={() => setRegenDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Why regenerate this question?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {["Too easy", "Not relevant", "Too similar to another", "Other"].map((reason) => (
              <Button
                key={reason}
                variant={regenReason === reason ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setRegenReason(reason)}
              >
                {reason}
              </Button>
            ))}
            {regenReason === "Other" && (
              <Input
                placeholder="Type your reason..."
                onChange={(e) => setRegenReason(e.target.value)}
              />
            )}
            <Button onClick={handleRegenerate} className="w-full" disabled={!regenReason}>
              <RefreshCw className="h-4 w-4 mr-2" /> Regenerate Question
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewAssessment;
