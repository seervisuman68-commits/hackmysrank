import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, MapPin, DollarSign, Clock, Zap, X, Target, FileText, Upload, CheckCircle, FileStack, Save, GitBranch, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import PdfQuestionsModal, { ExtractedQuestion } from "./PdfQuestionsModal";
import { normalizePipeline, defaultPipeline, PipelineStage } from "@/lib/pipeline";
import { Workflow } from "lucide-react";
import { Loader2 } from "@/components/BrandLoader";
import { addWorkflowJob } from "@/lib/hiringWorkflowEngine";
import { parsePdfQuestions } from "@/lib/pdfQuestionParser";

export interface JobTemplateRow {
  id: string;
  template_name: string;
  job_title: string | null;
  department: string | null;
  skills_required: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
  location: string | null;
  work_type: string | null;
  job_description: string | null;
  aptitude_cutoff_score: number | null;
  last_used_at?: string | null;
}

interface AddJobPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  hrUserId: string;
  managers: { id: string; full_name: string }[];
  onJobCreated: () => void;
  /** When provided, panel runs in template-edit mode (no job created, saves template instead). */
  editTemplate?: JobTemplateRow | null;
  /** When true, hides Post Job and only allows saving as template. */
  templateOnlyMode?: boolean;
  onTemplateSaved?: () => void;
}

const workTypes = ["Onsite", "Remote", "Hybrid"];
const employmentTypes = ["Full-time", "Part-time", "Internship", "Contract", "Temporary", "Freelance"];

const emptyForm = {
  title: "",
  department: "",
  managerId: "",
  salaryMin: "",
  salaryMax: "",
  location: "",
  workType: "Onsite",
  employmentType: "Full-time",
  experienceMin: "",
  experienceMax: "",
  skills: [] as string[],
  description: "",
  aptitudeCutoff: 60,
  resumeCutoff: 75,
  githubCutoff: 70,
  projectCutoff: 65,
};

const AddJobPanel = ({ open, onOpenChange, companyId, hrUserId, managers, onJobCreated, editTemplate = null, templateOnlyMode = false, onTemplateSaved }: AddJobPanelProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [confirmedQuestions, setConfirmedQuestions] = useState<ExtractedQuestion[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const questionCount = confirmedQuestions.length;
  const [form, setForm] = useState({ ...emptyForm });

  // Template state
  const [templates, setTemplates] = useState<JobTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  // Interview process templates
  const [processTemplates, setProcessTemplates] = useState<{ id: string; name: string; stages: any; is_default: boolean }[]>([]);
  const [processTemplateId, setProcessTemplateId] = useState<string>("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(defaultPipeline());
  const isEditMode = !!editTemplate;
  const isTemplateOnly = templateOnlyMode || isEditMode;

  const applyTemplateData = (t: JobTemplateRow) => {
    setForm({
      title: t.job_title || "",
      department: t.department || "",
      managerId: "",
      salaryMin: t.salary_min?.toString() || "",
      salaryMax: t.salary_max?.toString() || "",
      location: t.location || "",
      workType: t.work_type || "Onsite",
      employmentType: (t as any).employment_type || "Full-time",
      experienceMin: t.experience_min?.toString() || "",
      experienceMax: t.experience_max?.toString() || "",
      skills: t.skills_required || [],
      description: t.job_description || "",
      aptitudeCutoff: t.aptitude_cutoff_score ?? 60,
      resumeCutoff: (t as any).resume_cutoff_score ?? 75,
      githubCutoff: (t as any).github_cutoff_score ?? 70,
      projectCutoff: (t as any).project_cutoff_score ?? 65,
    });
  };

  // Load templates list (skip in edit mode)
  useEffect(() => {
    if (!open || !companyId || isEditMode) return;
    supabase
      .from("job_templates")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates((data as JobTemplateRow[]) || []));
    supabase
      .from("interview_process_templates")
      .select("id, name, stages, is_default")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        const list = (data as any) || [];
        setProcessTemplates(list);
        const def = list.find((t: any) => t.is_default);
        if (def && !processTemplateId) {
          setProcessTemplateId(def.id);
          setPipelineStages(normalizePipeline(def.stages));
        }
      });
  }, [open, companyId, isEditMode]);

  // Prefill when editing a template
  useEffect(() => {
    if (open && editTemplate) {
      applyTemplateData(editTemplate);
      setTemplateName(editTemplate.template_name);
    }
    if (!open) {
      // Reset on close
      setSelectedTemplateId("");
      setSaveAsTemplate(false);
      setTemplateName("");
    }
  }, [open, editTemplate]);

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (id === "__none__") {
      setForm({ ...emptyForm });
      return;
    }
    const t = templates.find((x) => x.id === id);
    if (t) applyTemplateData(t);
  };

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const addSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && skillInput.trim()) {
      e.preventDefault();
      if (!form.skills.includes(skillInput.trim())) {
        setForm((p) => ({ ...p, skills: [...p.skills, skillInput.trim()] }));
      }
      setSkillInput("");
    }
  };

  const removeSkill = (skill: string) => {
    setForm((p) => ({ ...p, skills: p.skills.filter((s) => s !== skill) }));
  };

  const handlePdfUpload = async (file: File) => {
    const name = (file?.name || "").toLowerCase();
    const mime = (file?.type || "").toLowerCase();
    const isPdf = mime === "application/pdf" || mime === "application/x-pdf" || name.endsWith(".pdf");
    if (!file || !isPdf) {
      toast({ title: "Invalid file", description: "Please upload a PDF file (.pdf).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF must be under 10MB.", variant: "destructive" });
      return;
    }

    setPdfFile(file);
    setParsingPdf(true);
    setExtractedQuestions([]);
    setConfirmedQuestions([]);

    toast({ title: "🤖 Analyzing PDF...", description: "AI is converting your PDF into MCQ questions. Please wait." });

    try {
      const result = await parsePdfQuestions(file, {
        jobTitle: form.title || "Software Engineer",
        skills: form.skills,
      });

      const qs: ExtractedQuestion[] = result.questions.map((q) => ({
        question_number: q.question_number,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        category: q.category,
        difficulty: q.difficulty,
        time_seconds: q.time_seconds || 60,
      }));

      if (qs.length === 0) throw new Error("No questions could be extracted from this PDF.");

      setExtractedQuestions(qs);
      setPreviewOpen(true);
      toast({ title: `✅ ${qs.length} Questions Extracted!`, description: "Review and confirm questions for this job." });
    } catch (err: any) {
      console.error("PDF parsing error:", err);
      toast({ title: "PDF parsing failed", description: err?.message || "Unknown error", variant: "destructive" });
      setPdfFile(null);
    }
    setParsingPdf(false);
  };


  const triggerFilePicker = () => fileInputRef.current?.click();

  const handlePreviewUseAll = (qs: ExtractedQuestion[]) => {
    setConfirmedQuestions(qs);
    setPreviewOpen(false);
    toast({
      title: `✅ ${qs.length} MCQ questions ready`,
      description: "Questions extracted from PDF and ready for review before sending to candidates.",
    });
  };

  const handlePreviewReupload = () => {
    setPreviewOpen(false);
    setExtractedQuestions([]);
    setConfirmedQuestions([]);
    setPdfFile(null);
    setTimeout(triggerFilePicker, 100);
  };

  const removePdf = () => {
    setPdfFile(null);
    setExtractedQuestions([]);
    setConfirmedQuestions([]);
  };

  // Convert flat MCQ array → legacy {sections:[{name, questions:[{question,options,correct_answer,...}]}]}
  // grouped by category so existing AptitudeTest / ReviewAssessment screens keep working.
  const toLegacyFormat = (qs: ExtractedQuestion[]) => {
    const grouped = new Map<string, any[]>();
    qs.forEach((q, i) => {
      const cat = q.category || "General";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push({
        question_number: i + 1,
        question: q.question,
        options: [q.option_a, q.option_b, q.option_c, q.option_d],
        correct_answer: q.correct_answer,
        category: q.category,
        difficulty: (q.difficulty || "Medium").toLowerCase(),
        time_seconds: q.time_seconds || 60,
      });
    });
    return {
      sections: Array.from(grouped.entries()).map(([name, questions]) => ({ name, questions })),
    };
  };

  const buildTemplatePayload = () => ({
    company_id: companyId,
    created_by: hrUserId,
    template_name: templateName.trim(),
    job_title: form.title || null,
    department: form.department || null,
    skills_required: form.skills,
    salary_min: form.salaryMin ? Number(form.salaryMin) : null,
    salary_max: form.salaryMax ? Number(form.salaryMax) : null,
    experience_min: form.experienceMin ? Number(form.experienceMin) : null,
    experience_max: form.experienceMax ? Number(form.experienceMax) : null,
    location: form.location || null,
    work_type: form.workType || null,
    employment_type: form.employmentType || null,
    job_description: form.description || null,
    aptitude_cutoff_score: form.aptitudeCutoff,
  });

  const resetAll = () => {
    setForm({ ...emptyForm });
    setPdfFile(null);
    setExtractedQuestions([]);
    setConfirmedQuestions([]);
    setSelectedTemplateId("");
    setSaveAsTemplate(false);
    setTemplateName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Template-only modes (edit existing template OR create template without posting)
    if (isTemplateOnly) {
      if (!templateName.trim()) {
        toast({ title: "Template name required", variant: "destructive" });
        setLoading(false);
        return;
      }
      if (isEditMode && editTemplate) {
        const { error } = await supabase
          .from("job_templates")
          .update(buildTemplatePayload())
          .eq("id", editTemplate.id);
        if (error) {
          toast({ title: "Failed to save template", description: error.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        toast({ title: "✅ Template updated" });
      } else {
        const { error } = await supabase.from("job_templates").insert(buildTemplatePayload());
        if (error) {
          toast({ title: "Failed to save template", description: error.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        toast({ title: "✅ Template saved" });
      }
      resetAll();
      onOpenChange(false);
      onTemplateSaved?.();
      setLoading(false);
      return;
    }
    if (!processTemplateId) {
      toast({ title: "Interview process required", description: "Select an interview process template before posting. Create one from the Interview Process page in the sidebar.", variant: "destructive" });
      setLoading(false);
      return;
    }


    const { data: insertedJob, error } = await supabase.from("jobs").insert({
      title: form.title,
      department: form.department,
      manager_id: form.managerId || null,
      salary_min: form.salaryMin ? Number(form.salaryMin) : null,
      salary_max: form.salaryMax ? Number(form.salaryMax) : null,
      location: form.location,
      work_type: form.workType,
      employment_type: form.employmentType,
      experience_min: form.experienceMin ? Number(form.experienceMin) : null,
      experience_max: form.experienceMax ? Number(form.experienceMax) : null,
      skills_required: form.skills,
      job_description: form.description || null,
      posted_by: hrUserId,
      company_id: companyId,
      status: "open",
      aptitude_cutoff: form.aptitudeCutoff,
      resume_cutoff: form.resumeCutoff,
      aptitude_questions: confirmedQuestions.length ? toLegacyFormat(confirmedQuestions) : null,
      pipeline_template_id: processTemplateId || null,
      pipeline_stages: JSON.parse(JSON.stringify(pipelineStages)),
    } as any).select("id").maybeSingle();

    if (error) {
      toast({ title: "Failed to post job", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (insertedJob?.id) {
      import("@/lib/embeddings").then((m) => m.refreshEmbedding("job", insertedJob.id));
    }

    // Save job into Before-Interview Cutoffs Workflow Engine
    addWorkflowJob({
      id: insertedJob?.id || `job-${Date.now()}`,
      title: form.title,
      department: form.department || "Engineering",
      requiredSkills: form.skills.length > 0 ? form.skills : ["Software Engineering", "Algorithms"],
      resumeCutoff: form.resumeCutoff,
      githubCutoff: form.githubCutoff,
      projectCutoff: form.projectCutoff,
      description: form.description || "",
      createdDate: new Date().toLocaleDateString(),
    });

    // Save as template if requested
    let savedTemplate = false;
    if (saveAsTemplate && templateName.trim()) {
      const { error: tplErr } = await supabase.from("job_templates").insert(buildTemplatePayload());
      if (!tplErr) savedTemplate = true;
    }

    // Mark template as used if one was selected
    if (selectedTemplateId && selectedTemplateId !== "__none__") {
      await supabase
        .from("job_templates")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", selectedTemplateId);
    }

    // Send notification to assigned manager
    if (form.managerId) {
      await supabase.from("notifications").insert({
        user_id: form.managerId,
        title: "New Job Posted",
        message: `New job posted for your team: ${form.title}${confirmedQuestions.length ? ` (${questionCount} aptitude questions attached)` : ""}`,
      });
    }

    // Notify Superadmins (owners of the company)
    const { data: superAdmins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "superadmin")
      .eq("company_id", companyId);

    if (superAdmins) {
      const { data: hrUser } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", hrUserId)
        .maybeSingle();

      const hrName = hrUser?.full_name || "HR Manager";

      for (const admin of superAdmins) {
        await supabase.from("notifications").insert({
          user_id: admin.id,
          title: "🆕 Job Posted",
          message: `${hrName} posted a new job: "${form.title}" in "${form.department}" department.`,
        });
      }
    }

    const assignedMgr = managers?.find((m: any) => m.id === form.managerId);
    toast({
      title: savedTemplate ? "Job posted and saved as template ✅" : "✅ Job posted successfully!",
      description: assignedMgr ? `Hiring Manager ${assignedMgr.full_name} has been notified.` : "Job is now live.",
    });

    resetAll();
    onOpenChange(false);
    onJobCreated();
    setLoading(false);
  };


  const inputClass = "w-full rounded-lg border border-border bg-secondary/50 py-3 pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm";
  const simpleInputClass = "w-full rounded-lg border border-border bg-secondary/50 py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold text-foreground">
            {isEditMode ? "Edit Template" : templateOnlyMode ? "Create Template" : "Post New Job"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template banner — only when posting a job */}
          {!isTemplateOnly && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileStack className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Use a saved template</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Fill the form faster with a previously saved job template.
              </p>
              {templates.length > 0 ? (
                <>
                  <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
                    <SelectTrigger className="bg-secondary/50 border-border h-10">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.template_name}{t.job_title ? ` — ${t.job_title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate("__none__")}
                    className="mt-2 text-[11px] text-primary hover:underline"
                  >
                    or start from scratch
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  No templates saved yet. Fill the form and save it as a template.
                </p>
              )}
            </div>
          )}

          {/* Interview Process picker (mandatory) */}
          {!isTemplateOnly && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Workflow className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Interview Process <span className="text-destructive">*</span></span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Choose which stages candidates go through. This drives their dashboard timeline, AI practice, and your action buttons.
              </p>
              {processTemplates.length > 0 ? (
                <>
                  <Select
                    value={processTemplateId}
                    onValueChange={(v) => {
                      setProcessTemplateId(v);
                      const t = processTemplates.find((x) => x.id === v);
                      if (t) setPipelineStages(normalizePipeline(t.stages));
                    }}
                  >
                    <SelectTrigger className="bg-secondary/50 border-border h-10">
                      <SelectValue placeholder="Select an interview process..." />
                    </SelectTrigger>
                    <SelectContent>
                      {processTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{t.is_default ? " ⭐" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {processTemplateId && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pipelineStages.filter((s) => s.enabled).map((s, i) => (
                        <span key={s.key} className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">
                          {i + 1}. {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  No interview processes yet. Create one from the "Interview Process" page in the sidebar before posting a job.
                </div>
              )}
            </div>
          )}



          {/* Job Title */}
          <div className="relative">
            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Job Title" required value={form.title} onChange={(e) => update("title", e.target.value)} className={inputClass} />
          </div>

          {/* Department */}
          <div className="relative">
            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Department" required value={form.department} onChange={(e) => update("department", e.target.value)} className={inputClass} />
          </div>

          {/* Assign Manager */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Assign Manager</label>
            <Select value={form.managerId} onValueChange={(v) => update("managerId", v)}>
              <SelectTrigger className="bg-secondary/50 border-border h-12">
                <SelectValue placeholder="Select a manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
                {managers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No managers available</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Salary Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="number" placeholder="Salary Min (LPA)" value={form.salaryMin} onChange={(e) => update("salaryMin", e.target.value)} className={inputClass} />
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="number" placeholder="Salary Max (LPA)" value={form.salaryMax} onChange={(e) => update("salaryMax", e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Location */}
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Location" required value={form.location} onChange={(e) => update("location", e.target.value)} className={inputClass} />
          </div>

          {/* Work Type */}
          <Select value={form.workType} onValueChange={(v) => update("workType", v)}>
            <SelectTrigger className="bg-secondary/50 border-border h-12">
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              {workTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Employment Type */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Employment Type *</label>
            <Select value={form.employmentType} onValueChange={(v) => update("employmentType", v)}>
              <SelectTrigger className="bg-secondary/50 border-border h-12">
                <SelectValue placeholder="Employment Type" />
              </SelectTrigger>
              <SelectContent>
                {employmentTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>


          {/* Experience Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="number" placeholder="Exp Min (yrs)" value={form.experienceMin} onChange={(e) => update("experienceMin", e.target.value)} className={inputClass} />
            </div>
            <div className="relative">
              <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="number" placeholder="Exp Max (yrs)" value={form.experienceMax} onChange={(e) => update("experienceMax", e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Skills Required</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.skills.map((skill) => (
                <span key={skill} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {skill}
                  <button type="button" onClick={() => removeSkill(skill)} className="hover:text-destructive transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Zap className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Type a skill and press Enter"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={addSkill}
                className={inputClass}
              />
            </div>
          </div>

          {/* Job Description */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Job Description</label>
            <textarea
              placeholder="Enter job description..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={4}
              className={`${simpleInputClass} resize-none`}
            />
          </div>

          {/* Aptitude PDF Upload */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">Aptitude Test PDF</label>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Upload a PDF with aptitude questions for this role. AI will convert it into MCQs automatically.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,application/x-pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePdfUpload(f);
                e.target.value = "";
              }}
            />

            {!pdfFile && confirmedQuestions.length === 0 && !parsingPdf && (
              <button
                type="button"
                onClick={triggerFilePicker}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-secondary/20 p-6 cursor-pointer transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload PDF</span>
                <span className="text-[10px] text-muted-foreground">Max 10MB • PDF only</span>
              </button>
            )}

            {parsingPdf && (
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 p-4">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium text-foreground">Analyzing PDF...</p>
                  <p className="text-[11px] text-muted-foreground">AI is converting content to MCQ format</p>
                </div>
              </div>
            )}

            {confirmedQuestions.length > 0 && !parsingPdf && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{questionCount} questions ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={removePdf}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{pdfFile?.name}</p>
              </div>
            )}

            {!parsingPdf && !pdfFile && confirmedQuestions.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Optional — If no PDF is uploaded, AI will auto-generate questions when a candidate reaches the aptitude stage.
              </p>
            )}
          </div>

          <PdfQuestionsModal
            open={previewOpen}
            questions={extractedQuestions}
            onClose={() => setPreviewOpen(false)}
            onUseAll={handlePreviewUseAll}
            onReupload={handlePreviewReupload}
          />

          {/* 1. Resume Match Cutoff */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">1. Resume Match Cutoff Score</label>
              <span className="ml-auto text-lg font-bold text-primary">{form.resumeCutoff}%</span>
            </div>
            <Slider
              value={[form.resumeCutoff]}
              onValueChange={(val) => setForm((p) => ({ ...p, resumeCutoff: val[0] }))}
              min={0}
              max={100}
              step={5}
              className="mb-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Applications with AI resume score &lt; {form.resumeCutoff}% will be auto-rejected with an automated detailed explanation.
            </p>
          </div>

          {/* 2. GitHub Code Quality & Authenticity Cutoff */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">2. GitHub Code Authenticity Cutoff</label>
              <span className="ml-auto text-lg font-bold text-primary">{form.githubCutoff}%</span>
            </div>
            <Slider
              value={[form.githubCutoff]}
              onValueChange={(val) => setForm((p) => ({ ...p, githubCutoff: val[0] }))}
              min={0}
              max={100}
              step={5}
              className="mb-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Requires ≥ {form.githubCutoff}% authentic human code (screens out heavy AI boilerplate repositories).
            </p>
          </div>

          {/* 3. Project Architecture Validation Cutoff */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-primary" />
              <label className="text-sm font-medium text-foreground">3. Project Validation Cutoff Score</label>
              <span className="ml-auto text-lg font-bold text-primary">{form.projectCutoff}%</span>
            </div>
            <Slider
              value={[form.projectCutoff]}
              onValueChange={(val) => setForm((p) => ({ ...p, projectCutoff: val[0] }))}
              min={0}
              max={100}
              step={5}
              className="mb-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Live deployment and architectural complexity must score ≥ {form.projectCutoff}% to proceed to interviews.
            </p>
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
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Candidates scoring ≥ {form.aptitudeCutoff}% will auto-advance to Video Round
            </p>
          </div>

          {/* Save as Template toggle (only when posting a new job) */}
          {!isTemplateOnly && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Save className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Save this as a template</span>
                </div>
                <Switch checked={saveAsTemplate} onCheckedChange={setSaveAsTemplate} />
              </div>
              {saveAsTemplate && (
                <div>
                  <input
                    type="text"
                    placeholder="e.g. React Developer Template"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className={simpleInputClass}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Name this template for easy reference next time.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Template-only mode requires a name */}
          {isTemplateOnly && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <Save className="h-4 w-4 text-primary" />
                Template Name
              </label>
              <input
                type="text"
                placeholder="e.g. React Developer Template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
                className={simpleInputClass}
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || parsingPdf}
            className="w-full rounded-lg py-6 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(160,100%,45%,0.2)] transition-all mt-2"
          >
            {loading
              ? (isTemplateOnly ? "Saving..." : "Posting...")
              : isEditMode
                ? "Save Changes"
                : templateOnlyMode
                  ? "Save as Template"
                  : "Post Job"}
          </Button>

        </form>
      </SheetContent>
    </Sheet>
  );
};

export default AddJobPanel;
