import { useState } from "react";
import { supabase, SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, X, Check, Target, FileText, Upload, CheckCircle, Trash2, Code2, Terminal, Cpu } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { normalizePipeline, enabledStages, type PipelineStage } from "@/lib/pipeline";
import { Loader2 } from "@/components/BrandLoader";
import { parsePdfQuestions, parseTechnicalFile, ParsedTechnicalResult } from "@/lib/pdfQuestionParser";
import TechnicalQuestionsModal from "@/components/TechnicalQuestionsModal";


interface JobRow {
  id: string;
  title: string;
  department: string;
  manager_id: string | null;
  salary_min: number | null;
  salary_max: number | null;
  location: string;
  work_type: string;
  applications_count: number;
  status: string;
  created_at: string;
}

interface Props {
  jobs: JobRow[];
  managers: { id: string; full_name: string }[];
  onPostJob: () => void;
  onJobUpdated?: () => void;
}

const workTypes = ["Onsite", "Remote", "Hybrid"];

const HRJobsView = ({ jobs, managers, onPostJob, onJobUpdated }: Props) => {
  const { toast } = useToast();
  const [editJob, setEditJob] = useState<JobRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<any>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [hasExistingQuestions, setHasExistingQuestions] = useState(false);

  // Technical Round questions state
  const [techFile, setTechFile] = useState<File | null>(null);
  const [parsingTech, setParsingTech] = useState(false);
  const [parsedTech, setParsedTech] = useState<ParsedTechnicalResult | null>(null);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [hasExistingTech, setHasExistingTech] = useState(false);
  const techCount = parsedTech
    ? (parsedTech.dsa?.length || 0) + (parsedTech.coding?.length || 0) + (parsedTech.mcq?.length || 0)
    : 0;

  const [deleteJob, setDeleteJob] = useState<JobRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [processTemplates, setProcessTemplates] = useState<{ id: string; name: string; stages: any; is_default: boolean }[]>([]);
  const [processTemplateId, setProcessTemplateId] = useState<string>("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);

  const [form, setForm] = useState({
    title: "",
    department: "",
    managerId: "",
    salaryMin: "",
    salaryMax: "",
    location: "",
    workType: "Onsite",
    status: "open",
    aptitudeCutoff: 60,
  });

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "—";
    return managers.find((m) => m.id === managerId)?.full_name || "—";
  };

  const openEdit = async (job: JobRow) => {
    setEditJob(job);
    setForm({
      title: job.title,
      department: job.department,
      managerId: job.manager_id || "",
      salaryMin: job.salary_min?.toString() || "",
      salaryMax: job.salary_max?.toString() || "",
      location: job.location,
      workType: job.work_type,
      status: job.status,
      aptitudeCutoff: (job as any).aptitude_cutoff ?? 60,
    });
    setPdfFile(null);
    setParsedQuestions(null);
    setQuestionCount(0);

    // Load this company's interview processes + the one attached to this job
    const { data: fresh } = await supabase
      .from("jobs")
      .select("company_id, pipeline_template_id, pipeline_stages")
      .eq("id", job.id)
      .maybeSingle();
    const currentTplId = (fresh as any)?.pipeline_template_id || "";
    const currentStages = (fresh as any)?.pipeline_stages;
    setProcessTemplateId(currentTplId);
    setPipelineStages(Array.isArray(currentStages) && currentStages.length ? normalizePipeline(currentStages) : []);

    const { data: tpls } = await supabase
      .from("interview_process_templates")
      .select("id, name, stages, is_default")
      .order("is_default", { ascending: false });
    const list = (tpls as any[]) || [];
    setProcessTemplates(list);
    if (!currentTplId && list.length) {
      const def = list.find((t) => t.is_default) || list[0];
      setProcessTemplateId(def.id);
      setPipelineStages(normalizePipeline(def.stages));
    }


    // Check if job already has aptitude questions (via secure RPC)
    const { data: existing } = await supabase.rpc("get_job_aptitude_questions", {
      _job_id: job.id,
    });

    if (existing) {
      setHasExistingQuestions(true);
      const ex = existing as any;
      const count = ex.sections?.reduce(
        (acc: number, sec: any) => acc + (sec.questions?.length || 0),
        0
      ) || 0;
      setQuestionCount(count);
      setParsedQuestions(ex);
    } else {
      setHasExistingQuestions(false);
    }

    // Check if job already has technical questions
    const stagesArr = Array.isArray(currentStages) ? currentStages : [];
    const techStage = stagesArr.find(
      (s: any) => s.type === "technical" || s.key === "technical_round" || s.key === "technical_test"
    );
    const existingTech = techStage?.config?.technical_questions;
    if (existingTech && (existingTech.dsa?.length || existingTech.coding?.length || existingTech.mcq?.length)) {
      setHasExistingTech(true);
      setParsedTech(existingTech);
    } else {
      setHasExistingTech(false);
      setParsedTech(null);
    }

    setEditOpen(true);
  };

  const handlePdfUpload = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF must be under 10MB.", variant: "destructive" });
      return;
    }

    setPdfFile(file);
    setParsingPdf(true);
    setParsedQuestions(null);

    toast({ title: "🤖 Analyzing PDF...", description: "AI is converting your PDF into MCQ questions." });

    try {
      const result = await parsePdfQuestions(file, {
        jobId: editJob?.id || "",
        jobTitle: editJob?.title || "Software Engineer",
      });

      if (result.sections && result.sections.length > 0) {
        setParsedQuestions({ sections: result.sections });
        const count = result.sections.reduce(
          (acc: number, sec: any) => acc + (sec.questions?.length || 0),
          0
        );
        setQuestionCount(count);
        setHasExistingQuestions(false);
        toast({ title: `✅ ${count} questions extracted!` });
      }
    } catch (err: any) {
      console.error("HRJobsView PDF parsing error:", err);
      toast({ title: "PDF parsing failed", description: err.message || "Could not process PDF", variant: "destructive" });
      setPdfFile(null);
    }
    setParsingPdf(false);
  };

  const removeQuestions = () => {
    setPdfFile(null);
    setParsedQuestions(null);
    setQuestionCount(0);
    setHasExistingQuestions(false);
  };

  const handleTechnicalUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "File must be under 15MB.", variant: "destructive" });
      return;
    }
    setTechFile(file);
    setParsingTech(true);
    toast({ title: "🤖 Analyzing Technical File...", description: "Extracting DSA problems, coding tasks, and MCQs." });
    try {
      const result = await parseTechnicalFile(file, {
        jobId: editJob?.id,
        jobTitle: editJob?.title || form.title || "Software Engineer",
      });
      setParsedTech(result);
      setHasExistingTech(false);
      setTechModalOpen(true);
      const total = (result.dsa?.length || 0) + (result.coding?.length || 0) + (result.mcq?.length || 0);
      toast({ title: `✅ ${total} Technical Challenges Extracted!` });
    } catch (err: any) {
      console.error("Technical file parsing error:", err);
      toast({ title: "File parsing failed", description: err.message || "Could not parse file", variant: "destructive" });
      setTechFile(null);
    }
    setParsingTech(false);
  };

  const removeTechQuestions = () => {
    setTechFile(null);
    setParsedTech(null);
    setHasExistingTech(false);
  };

  const handleSave = async () => {
    if (!editJob) return;
    setSaving(true);

    const updateData: any = {
      title: form.title,
      department: form.department,
      manager_id: form.managerId || null,
      salary_min: form.salaryMin ? Number(form.salaryMin) : null,
      salary_max: form.salaryMax ? Number(form.salaryMax) : null,
      location: form.location,
      work_type: form.workType,
      status: form.status,
      aptitude_cutoff: form.aptitudeCutoff,
    };

    // Keep the job's interview process (and its round list) in sync
    const baseStages = pipelineStages.length
      ? pipelineStages
      : normalizePipeline(processTemplates.find((t) => t.id === processTemplateId)?.stages);

    const stagesToSave = baseStages.map((s) => {
      if ((s.type === "technical" || s.key === "technical_round" || s.key === "technical_test") && parsedTech) {
        return {
          ...s,
          config: {
            ...s.config,
            technical_questions: parsedTech,
          },
        };
      }
      return s;
    });

    if (processTemplateId) {
      updateData.pipeline_template_id = processTemplateId;
    }
    updateData.pipeline_stages = JSON.parse(JSON.stringify(stagesToSave));

    // If new questions were parsed from PDF upload, save them
    if (parsedQuestions && !hasExistingQuestions) {
      updateData.aptitude_questions = parsedQuestions;
    }
    // If questions were explicitly removed
    if (!parsedQuestions && !hasExistingQuestions) {
      updateData.aptitude_questions = null;
    }

    const { error } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", editJob.id);

    if (error) {
      toast({ title: "Failed to update job", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Job updated successfully!" });
      setEditOpen(false);
      onJobUpdated?.();
    }
    setSaving(false);
  };

  const inputClass = "w-full rounded-lg border border-border bg-secondary/50 py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm";

  const handleDelete = async () => {
    if (!deleteJob) return;
    setDeleting(true);
    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", deleteJob.id)
      .select("id");
    if (error) {
      toast({ title: "Failed to delete job", description: error.message, variant: "destructive" });
    } else if (!data || data.length === 0) {
      toast({
        title: "Cannot delete job",
        description: "You don't have permission to delete this job, or it belongs to another company.",
        variant: "destructive",
      });
    } else {
      toast({ title: "🗑️ Job deleted", description: `"${deleteJob.title}" has been removed.` });
      setDeleteJob(null);
      onJobUpdated?.();
    }
    setDeleting(false);
  };


  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Posted Jobs ({jobs.length})</h2>
          <Button onClick={onPostJob} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Post New Job
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Job Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Applications</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Posted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No jobs posted yet. Click &quot;Post New Job&quot; to get started.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>{job.department}</TableCell>
                  <TableCell>{getManagerName(job.manager_id)}</TableCell>
                  <TableCell>
                    {job.salary_min && job.salary_max
                      ? `₹${job.salary_min.toLocaleString()} - ₹${job.salary_max.toLocaleString()}`
                      : "—"}
                  </TableCell>
                  <TableCell>{job.location}</TableCell>
                  <TableCell>{job.applications_count}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      job.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(job.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(job)}
                        className="gap-1.5 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteJob(job)}
                        className="gap-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Edit Job Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold text-foreground">Edit Job</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Job Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputClass} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Department</label>
              <input type="text" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className={inputClass} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Assign Manager</label>
              <Select value={form.managerId} onValueChange={(v) => setForm((p) => ({ ...p, managerId: v }))}>
                <SelectTrigger className="bg-secondary/50 border-border h-12">
                  <SelectValue placeholder="Select a manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Salary Min</label>
                <input type="number" value={form.salaryMin} onChange={(e) => setForm((p) => ({ ...p, salaryMin: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Salary Max</label>
                <input type="number" value={form.salaryMax} onChange={(e) => setForm((p) => ({ ...p, salaryMax: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Location</label>
              <input type="text" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className={inputClass} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Work Type</label>
              <Select value={form.workType} onValueChange={(v) => setForm((p) => ({ ...p, workType: v }))}>
                <SelectTrigger className="bg-secondary/50 border-border h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger className="bg-secondary/50 border-border h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Aptitude PDF Upload / Existing Questions */}
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <label className="text-sm font-medium text-foreground">Aptitude Test Questions</label>
              </div>

              {parsedQuestions && !parsingPdf ? (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {questionCount} questions {hasExistingQuestions ? "loaded" : "extracted"}
                      </span>
                    </div>
                    <button type="button" onClick={removeQuestions} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {pdfFile && <p className="text-[11px] text-muted-foreground">{pdfFile.name}</p>}
                  {parsedQuestions.sections && (
                    <div className="mt-2 space-y-1">
                      {parsedQuestions.sections.map((sec: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{sec.name}</span>
                          <span className="text-primary font-medium">{sec.questions?.length || 0} Qs</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : parsingPdf ? (
                <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Analyzing PDF...</p>
                    <p className="text-[11px] text-muted-foreground">AI is converting content to MCQ format</p>
                  </div>
                </div>
              ) : (
                <>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-secondary/20 p-5 cursor-pointer transition-colors">
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload PDF to replace questions</span>
                    <span className="text-[10px] text-muted-foreground">Max 5MB • PDF only</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfUpload(f);
                      }}
                    />
                  </label>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    No questions attached. AI will auto-generate when candidates reach aptitude stage.
                  </p>
                </>
              )}
            </div>

            {/* Technical Round Questions Upload */}
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="h-4 w-4 text-indigo-500" />
                <label className="text-sm font-medium text-foreground">Technical Round Questions (DSA & Coding)</label>
              </div>

              {parsedTech && !parsingTech ? (
                <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-indigo-500" />
                      <span className="text-sm font-medium text-foreground">
                        {techCount} challenges {hasExistingTech ? "attached" : "extracted"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTechModalOpen(true)}
                        className="text-xs font-medium text-indigo-500 hover:underline"
                      >
                        Review / Edit
                      </button>
                      <button
                        type="button"
                        onClick={removeTechQuestions}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {techFile && <p className="text-[11px] text-muted-foreground mb-1">{techFile.name}</p>}
                  <div className="grid grid-cols-3 gap-1.5 text-xs text-muted-foreground mt-2">
                    <span className="bg-secondary/40 p-1.5 rounded text-center">
                      <strong className="text-foreground">{parsedTech.dsa?.length || 0}</strong> DSA
                    </span>
                    <span className="bg-secondary/40 p-1.5 rounded text-center">
                      <strong className="text-foreground">{parsedTech.coding?.length || 0}</strong> Coding
                    </span>
                    <span className="bg-secondary/40 p-1.5 rounded text-center">
                      <strong className="text-foreground">{parsedTech.mcq?.length || 0}</strong> MCQs
                    </span>
                  </div>
                </div>
              ) : parsingTech ? (
                <div className="flex items-center gap-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 p-4">
                  <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Analyzing Technical Challenges...</p>
                    <p className="text-[11px] text-muted-foreground">Extracting DSA problems, coding tasks & MCQs</p>
                  </div>
                </div>
              ) : (
                <>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-indigo-500/50 bg-secondary/20 p-5 cursor-pointer transition-colors">
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload Technical Questions (PDF / DOCX / TXT)</span>
                    <span className="text-[10px] text-muted-foreground">Max 15MB • PDF, DOCX, TXT</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleTechnicalUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="text-[10px] text-muted-foreground mt-2 italic">
                    Optional — AI will automatically generate DSA and coding challenges for candidates if not uploaded.
                  </p>
                </>
              )}
            </div>

            <TechnicalQuestionsModal
              open={techModalOpen}
              technicalData={parsedTech || { dsa: [], coding: [], mcq: [] }}
              onClose={() => setTechModalOpen(false)}
              onConfirm={(data) => {
                setParsedTech(data);
                setHasExistingTech(false);
                setTechModalOpen(false);
                toast({ title: "✅ Technical Questions Updated" });
              }}
              onReupload={() => {
                setTechModalOpen(false);
                setParsedTech(null);
                setHasExistingTech(false);
                setTechFile(null);
              }}
            />

            {/* Interview Process Template */}
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <label className="text-sm font-medium text-foreground">Interview Process</label>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                Rounds shown on the candidate dashboard and the actions available to your team come from this process.
              </p>
              {processTemplates.length > 0 ? (
                <>
                  <Select
                    value={processTemplateId}
                    onValueChange={(v) => {
                      setProcessTemplateId(v);
                      const t = processTemplates.find((x) => x.id === v);
                      setPipelineStages(t ? normalizePipeline(t.stages) : []);
                    }}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Select interview process" />
                    </SelectTrigger>
                    <SelectContent>
                      {processTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{t.is_default ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pipelineStages.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      {enabledStages(pipelineStages).map((s, i) => (
                        <span key={s.key} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                          {i + 1}. {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No interview processes yet — create one from the Interview Process page.
                </p>
              )}
            </div>

            {/* Aptitude Cutoff */}
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-primary" />
                <label className="text-sm font-medium text-foreground">Aptitude Cutoff Score</label>
                <span className="ml-auto text-lg font-bold text-primary">{form.aptitudeCutoff}%</span>
              </div>
              <Slider
                value={[form.aptitudeCutoff]}
                onValueChange={(val) => setForm((p) => ({ ...p, aptitudeCutoff: val[0] }))}
                min={0}
                max={100}
                step={5}
                className="mb-2"
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Cutoff applied to the aptitude round of this job's interview process
              </p>
            </div>


            <Button onClick={handleSave} disabled={saving || parsingPdf} className="w-full rounded-lg py-6 text-sm font-semibold gap-2 mt-2">
              {saving ? "Saving..." : (<><Check className="h-4 w-4" /> Save Changes</>)}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteJob} onOpenChange={(o) => !o && setDeleteJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteJob?.title}" and all related applications, tests, interviews and offers will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default HRJobsView;
