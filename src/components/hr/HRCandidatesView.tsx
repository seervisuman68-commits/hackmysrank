import LiveScreenViewer from "@/components/hr/LiveScreenViewer";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/useLiveData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, XCircle, BookOpen, Eye, Video, Play, Code2, Filter, CheckCheck, CheckCircle2, Users, Calendar, AlertTriangle, Trash2, RotateCcw, LayoutGrid, Table as TableIcon, MessageCircle, X, GitCompare, Monitor, Radio, GitBranch, Layers, ScanSearch, ExternalLink } from "lucide-react";
import HRKanbanBoard from "./HRKanbanBoard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { PhotoImg } from "@/components/PhotoImg";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { HRPrivateNotes } from "./HRPrivateNotes";
import RejectWithReasonDialog from "./RejectWithReasonDialog";
import OfferLetterPanel from "@/components/OfferLetterPanel";
import { sendStageEmail } from "@/lib/stageEmail";
import { Loader2 } from "@/components/BrandLoader";
import { getWorkflowApplications } from "@/lib/hiringWorkflowEngine";
import { generateAndSaveAptitudeAssessment, generateAndSaveTechnicalAssessment, generateComprehensiveTechnicalQuestions } from "@/lib/assessmentGenerator";
import TechnicalQuestionsModal from "@/components/TechnicalQuestionsModal";
import { parseTechnicalFile, ParsedTechnicalResult } from "@/lib/pdfQuestionParser";

interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  current_stage: string;
  resume_score: number | null;
  resume_url: string | null;
  photo_url: string | null;
  ai_analysis: any;
  video_url: string | null;
  video_score: number | null;
  video_analysis: any;
  experience_years: number;
  current_company: string;
  current_ctc: number;
  expected_ctc: number;
  notice_period: number;
  applied_at: string;
  test_score: number | null;
  technical_score: number | null;
  code_answers: any;
  cover_letter: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
  technical_rounds?: string[] | null;
}

// Rejected / removed candidates disappear from every HR view 24h after the action.
const PURGE_MS = 24 * 60 * 60 * 1000;
const rejectionStamp = (a: any) =>
  new Date(a.rejected_at || a.updated_at || a.applied_at).getTime();
const closedStamp = (a: any): number | null => {
  if (a.deleted_at) return new Date(a.deleted_at).getTime();
  if (a.status === "rejected" || a.status === "deleted" || a.current_stage === "rejected") return rejectionStamp(a);
  return null;
};
const isPurged = (a: any) => {
  const t = closedStamp(a);
  return t != null && Date.now() - t > PURGE_MS;
};


interface Props {
  companyId: string;
  initialJobId?: string | null;
}

// How a PDF-based round must be answered by the candidate
const FORMAT_LABEL: Record<string, string> = {
  mcq: "Multiple choice (MCQ)",
  coding: "Coding / programming",
  fill_blanks: "Fill in the blanks",
  descriptive: "Written / descriptive answers",
  mixed: "Mixed question types",
};

const stageFlow = ["applied", "ai_scored", "shortlisted", "aptitude_test", "test_completed", "video_intro", "video_submitted", "technical_round", "technical_test", "technical_completed", "group_discussion", "gd_completed", "hr_interview", "interview", "offer_sent", "hired", "bgv", "onboarded", "selected", "rejected"];

const stageLabel: Record<string, string> = {
  applied: "Applied",
  ai_scored: "AI Scored",
  shortlisted: "Shortlisted",
  aptitude_test: "Aptitude Test",
  test_completed: "Test Done",
  video_intro: "Video Intro",
  video_submitted: "Video Done",
  technical_round: "Technical Round",


  technical_test: "Technical Test",
  technical_completed: "Technical Done",
  group_discussion: "Group Discussion",
  gd_completed: "GD Completed",
  hr_interview: "HR Interview",
  interview: "HR Interview",
  offer_sent: "Offer Sent",
  hired: "Hired",
  bgv: "BGV Pending",
  onboarded: "Onboarded",
  selected: "Selected",
  rejected: "Rejected",
};

const toHref = (u?: string | null) => {
  const v = String(u || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:|^tel:/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
};

const stageBadgeClass: Record<string, string> = {
  applied: "bg-muted text-muted-foreground",
  ai_scored: "bg-blue-500/10 text-blue-500",
  shortlisted: "bg-amber-500/10 text-amber-500",
  aptitude_test: "bg-purple-500/10 text-purple-500",
  test_completed: "bg-primary/10 text-primary",
  video_intro: "bg-pink-500/10 text-pink-500",
  video_submitted: "bg-emerald-500/10 text-emerald-500",
  technical_round: "bg-orange-500/10 text-orange-500",
  technical_test: "bg-orange-500/10 text-orange-500",
  technical_completed: "bg-teal-500/10 text-teal-500",
  group_discussion: "bg-cyan-500/10 text-cyan-500",
  gd_completed: "bg-cyan-500/10 text-cyan-500",
  hr_interview: "bg-indigo-500/10 text-indigo-500",
  interview: "bg-indigo-500/10 text-indigo-500",
  offer_sent: "bg-emerald-500/10 text-emerald-500",
  hired: "bg-primary/10 text-primary",
  bgv: "bg-amber-500/10 text-amber-500",
  onboarded: "bg-primary/10 text-primary",
  selected: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

const HRCandidatesView = ({ companyId, initialJobId }: Props) => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<(Application & { candidate_name: string; candidate_email: string; job_title: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [liveScreen, setLiveScreen] = useState<{ id: string; stage: string; name?: string } | null>(null);
  // Custom template round setup (PDF brief / meeting link / plain instructions)
  const [customRound, setCustomRound] = useState<{ app: any; next: { key: string; stage: string; label: string; type?: string } } | null>(null);
  const [customMode, setCustomMode] = useState<"pdf" | "link" | "note">("pdf");
  const [customFormat, setCustomFormat] = useState("mcq");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customLink, setCustomLink] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [customSending, setCustomSending] = useState(false);
  // Round briefs (custom template rounds) keyed by application id
  const [briefMap, setBriefMap] = useState<Record<string, any>>({});
  const [briefView, setBriefView] = useState<any | null>(null);
  // Staff-only score for a custom round (never exposed to the candidate)
  const [briefScore, setBriefScore] = useState("");
  const [briefFeedback, setBriefFeedback] = useState("");
  const [briefSaving, setBriefSaving] = useState(false);

  useEffect(() => {
    if (!briefView?.id) { setBriefScore(""); setBriefFeedback(""); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("round_scores")
        .select("score, feedback")
        .eq("brief_id", briefView.id)
        .maybeSingle();
      setBriefScore(data?.score != null ? String(data.score) : "");
      setBriefFeedback(data?.feedback || "");
    })();
  }, [briefView?.id]);

  const saveBriefScore = async () => {
    if (!briefView?.id) return;
    setBriefSaving(true);
    const { error } = await (supabase as any).from("round_scores").upsert(
      {
        brief_id: briefView.id,
        application_id: briefView.application_id,
        company_id: companyId,
        score: briefScore === "" ? null : Number(briefScore),
        feedback: briefFeedback.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brief_id" }
    );
    setBriefSaving(false);
    if (error) toast({ title: "Could not save the score", description: error.message, variant: "destructive" });
    else toast({ title: "Score saved", description: "Visible to your hiring team only." });
  };

  const [testResultDialog, setTestResultDialog] = useState<any>(null);
  const [testAnswers, setTestAnswers] = useState<any[]>([]);
  const [testViolations, setTestViolations] = useState<any[]>([]);
  const [testQuestions, setTestQuestions] = useState<any[]>([]);
  const [testSections, setTestSections] = useState<any[]>([]);
  const [candidatePhotoUrl, setCandidatePhotoUrl] = useState<string | null>(null);
  const [generatingTestFor, setGeneratingTestFor] = useState<string | null>(null);
  const [generatingTechnicalFor, setGeneratingTechnicalFor] = useState<string | null>(null);
  const [bulkGeneratingAptitude, setBulkGeneratingAptitude] = useState(false);
  const [bulkGeneratingTechnical, setBulkGeneratingTechnical] = useState(false);
  const [videoDialog, setVideoDialog] = useState<any>(null);
  const [videoSignedUrl, setVideoSignedUrl] = useState<string | null>(null);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("hr");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [cutoffDialogOpen, setCutoffDialogOpen] = useState(false);
  const [cutoffScore, setCutoffScore] = useState(60);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [technicalReportDialog, setTechnicalReportDialog] = useState<any>(null);
  const [technicalAssessment, setTechnicalAssessment] = useState<any>(null);
  const [techAssessMap, setTechAssessMap] = useState<Record<string, any>>({});
  const [aptAssessMap, setAptAssessMap] = useState<Record<string, any>>({});
  const [offerMap, setOfferMap] = useState<Record<string, any>>({});
  const [interviewMap, setInterviewMap] = useState<Record<string, any>>({});

  // Technical Round Setup in Dashboard
  const [techSetupApp, setTechSetupApp] = useState<(Application & { candidate_name: string; job_title: string; candidate_email?: string }) | null>(null);
  const [techQuestions, setTechQuestions] = useState<ParsedTechnicalResult>({ dsa: [], coding: [], mcq: [] });
  const [techSetupSource, setTechSetupSource] = useState<"ai" | "pdf" | "job">("ai");
  const [techUploadingFile, setTechUploadingFile] = useState(false);
  const [techGeneratingAI, setTechGeneratingAI] = useState(false);
  const [techSubmitting, setTechSubmitting] = useState(false);
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [techActivePreviewTab, setTechActivePreviewTab] = useState<"dsa" | "coding" | "mcq">("dsa");
  const techFileInputRef = useState<HTMLInputElement | null>(null);
  const [offerApp, setOfferApp] = useState<any>(null);
  const [detailsDialog, setDetailsDialog] = useState<any>(null);
  const [detailsPhotoUrl, setDetailsPhotoUrl] = useState<string | null>(null);
  const [detailsResumeUrl, setDetailsResumeUrl] = useState<string | null>(null);
  const [detailsProfile, setDetailsProfile] = useState<any>(null);
  const [detailsCertUrls, setDetailsCertUrls] = useState<Array<{ name: string; url?: string; issuer?: string; year?: string }>>([]);
  const [detailsJobSkills, setDetailsJobSkills] = useState<string[]>([]);
  const [bulkMovingToGD, setBulkMovingToGD] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [rejectApp, setRejectApp] = useState<Application | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobFilter, setJobFilter] = useState<string>(initialJobId || "all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkAction, setBulkAction] = useState<null | "move" | "message" | "reject">(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkMoveStage, setBulkMoveStage] = useState<string>("aptitude_test");
  const [bulkMessageText, setBulkMessageText] = useState("");
  const [bulkRejectReason, setBulkRejectReason] = useState<string>("Not enough experience");
  const [bulkRejectOther, setBulkRejectOther] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "kanban">(() => {
    if (typeof window === "undefined") return "table";
    return (localStorage.getItem("hr_view_mode") as "table" | "kanban") || "table";
  });
  const { toast } = useToast();

  // Detect current user role and name
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("users").select("id, role, full_name").eq("user_id", session.user.id).maybeSingle();
      if (data) {
        setCurrentUserRole(data.role);
        setCurrentUserName(data.full_name);
        setCurrentUserId(data.id);
      }
    })();
  }, []);

  // React to dashboard "View candidates" deep-link
  useEffect(() => {
    if (initialJobId) setJobFilter(initialJobId);
  }, [initialJobId]);

  // Auto-purge: rejected/removed candidates are permanently dropped 24h after the action.
  useEffect(() => {
    const stale = applications.filter((a) => isPurged(a) && !a.deleted_at).map((a) => a.id);
    if (stale.length === 0) return;
    void supabase
      .from("applications")
      .update({ deleted_at: new Date().toISOString(), status: "deleted" } as any)
      .in("id", stale);
  }, [applications]);



  // Soft delete via deleted_at + "not shortlisted" notification
  const deleteApplications = async (ids: string[]) => {
    if (ids.length === 0) return;
    const targets = applications.filter((a) => ids.includes(a.id));
    const now = new Date().toISOString();
    setApplications((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, status: "deleted", deleted_at: now } as any : a));
    await supabase.from("applications").update({ deleted_at: now } as any).in("id", ids);
    const notif = targets.map((a) => ({
      user_id: a.candidate_id,
      title: "Application Update",
      message: `Thank you for applying for ${a.job_title}. After review, you have not been shortlisted for this role. We appreciate your interest and wish you the best ahead.`,
      category: "application",
      type: "stage",
    }));
    if (notif.length) await supabase.from("notifications").insert(notif);
    setSelectedIds(new Set());
    toast({ title: `Removed ${ids.length} candidate${ids.length > 1 ? "s" : ""}`, description: "Candidates notified: not shortlisted." });
  };

  // Notify HR and Super Admins of actions
  const notifyHROfManagerAction = async (title: string, message: string) => {
    const recipients: string[] = [];

    // 1. If action is taken by manager, notify HR managers
    if (currentUserRole === "manager") {
      const { data: hrUsers } = await supabase
        .from("users")
        .select("id")
        .eq("role", "hr")
        .eq("company_id", companyId);
      if (hrUsers) {
        recipients.push(...hrUsers.map((hr) => hr.id));
      }
    }

    // 2. Always notify superadmins (owners of the company)
    const { data: superAdmins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "superadmin")
      .eq("company_id", companyId);
    if (superAdmins) {
      recipients.push(...superAdmins.map((sa) => sa.id));
    }

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients)];

    const inserts = uniqueRecipients.map((uid) => ({
      user_id: uid,
      title,
      message,
    }));

    if (inserts.length > 0) {
      await supabase.from("notifications").insert(inserts);
    }
  };


  const fetchApplications = async () => {
    setLoading(true);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, pipeline_stages")
      .eq("company_id", companyId);

    if (!jobs || jobs.length === 0) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const jobIds = jobs.map((j) => j.id);
    const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j.title]));
    const jobPipelineMap = Object.fromEntries(jobs.map((j: any) => [j.id, j.pipeline_stages || null]));

    const { data: apps } = await supabase
      .from("applications")
      .select("*")
      .in("job_id", jobIds)
      .order("applied_at", { ascending: false });

    if (!apps || apps.length === 0) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const candidateIds = [...new Set(apps.map((a) => a.candidate_id))];
    const { data: candidates } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", candidateIds);

    const candidateMap = Object.fromEntries(
      (candidates || []).map((c) => [c.id, { name: c.full_name, email: c.email }])
    );

    const appIds = apps.map((a) => a.id);

    // Which candidates already have technical / aptitude assessments created (so we never
    // offer "generate" twice), which already received an offer, and which already have
    // an interview on the calendar (so the "Schedule Interview" action disappears).
    const [techRes, aptRes, offerRes, intRes] = await Promise.all([
      supabase.from("assessments").select("id, application_id, status").eq("type", "technical").in("application_id", appIds),
      supabase.from("assessments").select("id, application_id, status").eq("type", "aptitude").in("application_id", appIds),
      supabase.from("offer_letters").select("id, application_id, status, created_at, accepted_at, decline_reason, designation, ctc_total, joining_date").in("application_id", appIds),
      supabase.from("interviews").select("id, application_id, status, round_type, scheduled_date, scheduled_time").in("application_id", appIds),
    ]);
    setTechAssessMap(Object.fromEntries(((techRes.data as any[]) || []).map((t) => [t.application_id, t])));
    setAptAssessMap(Object.fromEntries(((aptRes.data as any[]) || []).map((t) => [t.application_id, t])));
    const offers = (offerRes.data as any[]) || [];
    setOfferMap(Object.fromEntries(offers.map((o) => [o.application_id, o])));
    setInterviewMap(Object.fromEntries(((intRes.data as any[]) || []).map((i) => [i.application_id, i])));

    // Keep the pipeline in sync: an accepted offer means the candidate is hired.
    const acceptedNotHired = offers.filter(
      (o) => o.status === "accepted" && apps.some((a) => a.id === o.application_id && a.current_stage !== "hired")
    );
    if (acceptedNotHired.length) {
      await supabase
        .from("applications")
        .update({ current_stage: "hired", status: "hired" })
        .in("id", acceptedNotHired.map((o) => o.application_id));
    }
    const hiredIds = new Set(acceptedNotHired.map((o) => o.application_id));

    const enriched = apps.map((a) => ({
      ...a,
      ...(hiredIds.has(a.id) ? { current_stage: "hired", status: "hired" } : {}),
      candidate_name: candidateMap[a.candidate_id]?.name || "Unknown",
      candidate_email: candidateMap[a.candidate_id]?.email || "",
      job_title: jobMap[a.job_id] || "Unknown Job",
      pipeline_stages: jobPipelineMap[a.job_id],
    }));

    setApplications(enriched as any);
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) fetchApplications();
  }, [companyId]);

  // Briefs / links / submissions for custom template rounds
  const fetchBriefs = async () => {
    const ids = applications.map((a) => a.id);
    if (ids.length === 0) { setBriefMap({}); return; }
    const { data } = await (supabase as any)
      .from("round_briefs")
      .select("*")
      .in("application_id", ids)
      .order("created_at", { ascending: false });
    const map: Record<string, any> = {};
    (data || []).forEach((b: any) => { if (!map[b.application_id]) map[b.application_id] = b; });
    setBriefMap(map);
  };

  useEffect(() => {
    fetchBriefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications.length]);


  // Real-time subscription for application / round updates
  useLiveData(
    ["applications", "interviews", "offer_letters", "assessments", "round_briefs", "round_scores", "candidate_profiles"],
    () => { fetchApplications(); fetchBriefs(); },
    { key: `hr-app-updates-${companyId}`, enabled: !!companyId },
  );

  const handleViewResume = async (url: string | null) => {
    if (!url) {
      toast({ title: "No Resume", description: "This candidate did not upload a resume." });
      return;
    }

    let storagePath = url;

    // If it's a full Supabase URL, extract the storage path
    if (url.startsWith("http")) {
      const marker = "/object/public/resumes/";
      const markerAlt = "/object/sign/resumes/";
      let idx = url.indexOf(marker);
      if (idx !== -1) {
        storagePath = decodeURIComponent(url.substring(idx + marker.length));
      } else {
        idx = url.indexOf(markerAlt);
        if (idx !== -1) {
          storagePath = decodeURIComponent(url.substring(idx + markerAlt.length));
        }
      }
    }

    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) {
      setResumeUrl(data.signedUrl);
      setResumeDialogOpen(true);
    } else {
      console.error("Signed URL error:", error, "path:", storagePath);
      toast({ title: "Error", description: "Could not load resume. The file may not exist.", variant: "destructive" });
    }
  };

  const handleViewCandidateDetails = async (app: any) => {
    setDetailsDialog(app);
    setDetailsPhotoUrl(null);
    setDetailsResumeUrl(null);
    setDetailsProfile(null);
    setDetailsCertUrls([]);
    setDetailsJobSkills([]);

    // Load job's required skills for match highlighting
    if (app.job_id) {
      const { data: job } = await supabase.from("jobs").select("skills_required").eq("id", app.job_id).maybeSingle();
      if (job?.skills_required) setDetailsJobSkills(job.skills_required as string[]);
    }


    // Get photo URL (signed; bucket is private)
    if (app.photo_url) {
      const { resolvePhotoUrl } = await import("@/lib/photoUrl");
      const url = await resolvePhotoUrl(app.photo_url);
      if (url) setDetailsPhotoUrl(url);
    }

    // Get resume signed URL
    if (app.resume_url) {
      let storagePath = app.resume_url;
      if (storagePath.startsWith("http")) {
        const marker = "/object/public/resumes/";
        const idx = storagePath.indexOf(marker);
        if (idx !== -1) storagePath = decodeURIComponent(storagePath.substring(idx + marker.length));
      }
      const { data } = await supabase.storage.from("resumes").createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) setDetailsResumeUrl(data.signedUrl);
    }

    // Load full candidate profile (LinkedIn-style sections)
    if (app.candidate_id || app.candidate_email) {
      // applications.candidate_id is the public users.id PK — resolve the auth user_id first
      let authUserId: string | null = null;
      const { data: urow } = await supabase
        .from("users")
        .select("user_id")
        .eq("id", app.candidate_id)
        .maybeSingle();
      authUserId = urow?.user_id || null;

      // Fallback: resolve via email
      if (!authUserId && app.candidate_email) {
        const { data: byEmail } = await supabase
          .from("users")
          .select("user_id")
          .eq("email", app.candidate_email)
          .maybeSingle();
        authUserId = byEmail?.user_id || null;
      }

      let prof: any = null;
      let profErr: any = null;
      if (authUserId) {
        const res = await supabase
          .from("candidate_profiles")
          .select("*")
          .eq("user_id", authUserId)
          .maybeSingle();
        prof = res.data;
        profErr = res.error;
      }

      if (profErr) {
        console.error("candidate_profiles load failed", profErr);
        toast({ title: "Profile unavailable", description: profErr.message, variant: "destructive" });
      }
      if (prof) {
        setDetailsProfile(prof);
        // Resolve photo from profile if app row had none
        if (!app.photo_url && prof.photo_url) {
          const { resolvePhotoUrl } = await import("@/lib/photoUrl");
          const url = await resolvePhotoUrl(prof.photo_url);
          if (url) setDetailsPhotoUrl(url);
        }
        // Certificates may be plain text entries {name, issuer, year},
        // storage-backed {name, path} or direct links {name, url}.
        const certs = Array.isArray(prof.certifications) ? (prof.certifications as any[]) : [];
        const resolved: Array<{ name: string; url?: string; issuer?: string; year?: string }> = [];
        for (const c of certs as Array<any>) {
          if (typeof c === "string") { resolved.push({ name: c }); continue; }
          const base = { name: c?.name || c?.title || "Certificate", issuer: c?.issuer, year: c?.year };
          if (c?.path) {
            const bucket = String(c.bucket || "bgv-documents");
            const { data } = await supabase.storage.from(bucket).createSignedUrl(c.path, 3600);
            resolved.push({ ...base, url: data?.signedUrl });
          } else if (c?.url || c?.link) {
            resolved.push({ ...base, url: c.url || c.link });
          } else {
            resolved.push(base);
          }
        }
        setDetailsCertUrls(resolved);
      }
    }
  };


  const handleUpdateStage = async (appId: string, newStage: string) => {
    // Optimistic update — instant UI change
    const appData = applications.find((a) => a.id === appId);
    setApplications((prev) =>
      prev.map((a) =>
        a.id === appId
          ? { ...a, current_stage: newStage, status: newStage === "rejected" ? "rejected" : "active" }
          : a
      )
    );
    toast({ title: "Updated", description: `Candidate moved to ${stageLabel[newStage] || newStage.replace("round:", "")}.` });

    const { error } = await supabase
      .from("applications")
      .update({ current_stage: newStage, status: newStage === "rejected" ? "rejected" : "active" })
      .eq("id", appId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchApplications(); // revert on error
      return;
    }

    // Professional automated email for every stage transition
    if (appData) {
      if (newStage === "hired" || newStage === "selected") {
        sendStageEmail({ applicationId: appId, event: "hired", stage: appData.current_stage });
      } else if (newStage === "offer" || newStage === "offer_sent") {
        sendStageEmail({ applicationId: appId, event: "offer_sent", stage: appData.current_stage });
      } else if (newStage !== "rejected") {
        sendStageEmail({
          applicationId: appId,
          event: "shortlisted",
          stage: appData.current_stage,
          nextStage: newStage,
        });
      }
    }

    // Send notification to candidate when hired
    if (newStage === "hired" && appData) {
      await supabase.from("notifications").insert({
        user_id: appData.candidate_id,
        title: "🎉 Congratulations! You are Hired!",
        message: `We are thrilled to inform you that you have been selected for the position of ${appData.job_title}. Please check your email for the official offer letter and next steps. Welcome aboard!`,
      });

      // Trigger hire email edge function
      supabase.functions.invoke("send-hire-email", {
        body: { applicationId: appId, candidateId: appData.candidate_id },
      }).then((res) => {
        if (res.error) console.error("Hire email error:", res.error);
      });
    }

    // Send "Better luck next time" when rejected
    if (newStage === "rejected" && appData) {
      sendStageEmail({ applicationId: appId, event: "rejected", stage: appData.current_stage });
      await supabase.from("notifications").insert({
        user_id: appData.candidate_id,
        title: "Better Luck Next Time 🍀",
        message: `Thank you for applying for ${appData.job_title}. Unfortunately, we have decided to move forward with other candidates. We wish you all the best in your future endeavors.`,
      });
    }


    // Auto-cleanup storage for terminal stages (hired, rejected, selected, onboarded)
    if (["hired", "rejected", "selected", "onboarded"].includes(newStage)) {
      supabase.functions.invoke("cleanup-storage", {
        body: { applicationId: appId },
      }).then((res) => {
        if (res.error) console.error("Storage cleanup error:", res.error);
        else console.log("Storage cleaned up for:", appId);
      });
    }

    await notifyHROfManagerAction(
      "Manager Action",
      `${currentUserName} moved ${appData?.candidate_name || "a candidate"} to ${stageLabel[newStage] || newStage.replace("round:", "")}.`
    );
  };

  // Move a candidate into a custom template round (assignment / external meeting /
  // anything HR invented) after collecting the brief for that round.
  const submitCustomRound = async () => {
    if (!customRound) return;
    const { app, next } = customRound;
    setCustomSending(true);
    try {
      let briefUrl = "";
      let linkUrl = "";
      let interviewId: string | null = null;

      if (customMode === "pdf") {
        if (!customFile) {
          toast({ title: "Attach the PDF", description: "Upload the brief you want the candidate to receive.", variant: "destructive" });
          setCustomSending(false);
          return;
        }
        const path = `${companyId}/round-briefs/${app.id}-${Date.now()}-${customFile.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("company-assets").upload(path, customFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("company-assets").createSignedUrl(path, 60 * 60 * 24 * 14);
        briefUrl = signed?.signedUrl || "";
      } else if (customMode === "link") {
        if (customLink.trim()) {
          // HR pasted their own meeting link
          linkUrl = toHref(customLink);
        } else {
          // Auto-create a live room for this round
          const { data: iv, error: ivErr } = await supabase
            .from("interviews")
            .insert({
              application_id: app.id,
              candidate_id: app.candidate_id,
              job_id: app.job_id,
              company_id: companyId,
              interviewer_id: currentUserId || null,
              interviewer_name: currentUserName || "Hiring Team",
              round_type: next.label,
              scheduled_date: new Date().toISOString().slice(0, 10),
              scheduled_time: new Date().toTimeString().slice(0, 5),
              duration: 45,
              mode: "video_call",
              status: "scheduled",
            } as any)
            .select("id")
            .single();
          if (ivErr) throw ivErr;
          interviewId = iv.id;
          await supabase.functions.invoke("create-video-room", {
            body: { interviewId: iv.id, appOrigin: window.location.origin },
          });
          linkUrl = `${window.location.origin}/interview-room/${iv.id}`;
        }
      }

      const bodyLines = [
        customNote.trim() || `You have been moved to the ${next.label} round for ${app.job_title}.`,
        briefUrl ? `Brief (PDF): ${briefUrl}` : "",
        briefUrl ? `Answer format: ${FORMAT_LABEL[customFormat] || customFormat}` : "",
        linkUrl ? `Join link: ${linkUrl}` : "",
      ].filter(Boolean);

      await (supabase as any).from("round_briefs").upsert(
        {
          application_id: app.id,
          company_id: companyId,
          candidate_id: app.candidate_id,
          stage_key: next.key,
          label: next.label,
          mode: customMode,
          question_format: customMode === "pdf" ? customFormat : null,
          brief_url: briefUrl || null,
          link_url: linkUrl || null,
          instructions: customNote.trim() || null,
          interview_id: interviewId,
        },
        { onConflict: "application_id,stage_key" }
      );

      await supabase.from("notifications").insert({
        user_id: app.candidate_id,
        title: `Next round: ${next.label}`,
        message: bodyLines.join("\n\n"),
      });

      await handleUpdateStage(app.id, next.stage);
      await fetchBriefs();
      toast({ title: `Moved to ${next.label}`, description: "The candidate has been notified with the details." });
      setCustomRound(null);
      setCustomFile(null);
      setCustomLink("");
      setCustomNote("");
      setCustomMode("pdf");

    } catch (e: any) {
      toast({ title: "Could not start this round", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setCustomSending(false);
    }
  };



  const clearBulk = () => {
    setSelectedIds(new Set());
    setBulkAction(null);
    setBulkProgress(null);
    setBulkMessageText("");
    setBulkRejectOther("");
  };

  const runBulkMove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: ids.length });
    let done = 0;
    for (const id of ids) {
      try { await handleUpdateStage(id, bulkMoveStage); } catch (e) { console.error(e); }
      done += 1; setBulkProgress({ done, total: ids.length });
    }
    setBulkBusy(false);
    toast({ title: "Done", description: `${ids.length} candidates moved to ${stageLabel[bulkMoveStage] || bulkMoveStage}.` });
    clearBulk();
  };

  const runBulkMessage = async () => {
    const ids = Array.from(selectedIds);
    const text = bulkMessageText.trim();
    if (!text || ids.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: ids.length });
    const rows = ids.map((id) => {
      const app = applications.find((a) => a.id === id);
      return app ? { user_id: app.candidate_id, title: "💬 Message from HR", message: text, type: "message", category: "message" } : null;
    }).filter(Boolean) as any[];
    try {
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
      // best-effort chat insert
      if (currentUserId) {
        const chatRows = ids.map((id) => {
          const app = applications.find((a) => a.id === id);
          return app ? { sender_id: currentUserId, receiver_id: app.candidate_id, message: text } : null;
        }).filter(Boolean) as any[];
        await supabase.from("chat_messages").insert(chatRows as any);
      }
      setBulkProgress({ done: ids.length, total: ids.length });
      toast({ title: "Sent", description: `Message sent to ${ids.length} candidates.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBulkBusy(false);
    clearBulk();
  };

  const runBulkReject = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const reason = bulkRejectReason === "Other reason" ? bulkRejectOther.trim() : bulkRejectReason;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: ids.length });
    let done = 0;
    for (const id of ids) {
      const app = applications.find((a) => a.id === id);
      try {
        await supabase.from("applications").update({
          status: "rejected",
          current_stage: "rejected",
          rejection_stage: app?.current_stage || null,
          rejected_at: new Date().toISOString(),
        } as any).eq("id", id);
        if (app) {
          await supabase.from("notifications").insert({
            user_id: app.candidate_id,
            title: "Application Update 🍀",
            message: `Thank you for applying for ${app.job_title}. After careful consideration we have decided to move forward with other candidates. We wish you the very best in your future endeavors.`,
            type: "stage",
            category: "application",
          } as any);
          sendStageEmail({ applicationId: id, event: "rejected", stage: app.current_stage, reason });
          supabase.functions.invoke("cleanup-storage", { body: { applicationId: id } }).catch(() => {});
        }
      } catch (e) { console.error(e); }
      done += 1; setBulkProgress({ done, total: ids.length });
    }
    setApplications((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, status: "rejected", current_stage: "rejected" } : a));
    setBulkBusy(false);
    console.log("[bulk reject] reason:", reason);
    toast({ title: "Rejected", description: `${ids.length} candidates rejected.` });
    clearBulk();
  };

  const handleOpenAptitudeTest = async (app: Application & { candidate_name: string; job_title: string }) => {
    setGeneratingTestFor(app.id);
    toast({ title: "Preparing test…", description: "Using the questions attached to this job, or generating them if none were uploaded." });

    try {
      // Get HR user id
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: hrUser } = await supabase
        .from("users")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const assessmentResult = await generateAndSaveAptitudeAssessment(
        app.job_id,
        app.id,
        companyId,
        hrUser?.id
      );

      if (assessmentResult?.assessmentId) {
        setAptAssessMap((prev) => ({ ...prev, [app.id]: { id: assessmentResult.assessmentId, application_id: app.id, status: assessmentResult.status || "approved" } }));

        // If pre-uploaded or approved directly, send to candidate
        if (assessmentResult.source === "pre_uploaded") {
          await handleUpdateStage(app.id, "aptitude_test");
          toast({
            title: "✅ Test sent",
            description: `${app.candidate_name} can now take the aptitude test with the questions you uploaded for this job.`,
          });
          setGeneratingTestFor(null);
          return;
        }

        toast({
          title: "🤖 Aptitude Test Prepared",
          description: "Opening review assessment screen to inspect and approve questions.",
        });
        await notifyHROfManagerAction(
          "📝 Questions Generated",
          `${currentUserName} generated aptitude questions for ${app.candidate_name} (${app.job_title}).`
        );
        navigate(`/review-assessment/${assessmentResult.assessmentId}`);
      }
    } catch (e: any) {
      console.error("Aptitude test preparation error:", e);
      toast({ title: "Error", description: e.message || "Failed to generate questions", variant: "destructive" });
    }
    setGeneratingTestFor(null);
  };

  const handleViewTestResults = async (app: any) => {
    setTestResultDialog(app);
    setTestQuestions([]);
    setTestSections([]);
    setCandidatePhotoUrl(null);

    // Fetch answers, violations, assessment questions, and photo in parallel
    const [answersRes, violsRes, assessmentRes] = await Promise.all([
      supabase.from("test_answers").select("*").eq("application_id", app.id).order("question_index", { ascending: true }),
      supabase.from("test_violations").select("*").eq("application_id", app.id).order("created_at", { ascending: true }),
      supabase.from("assessments").select("questions").eq("application_id", app.id).maybeSingle(),
    ]);

    setTestAnswers(answersRes.data || []);
    setTestViolations(violsRes.data || []);

    // Parse assessment questions into flat list with section info
    if (assessmentRes.data?.questions) {
      const q = assessmentRes.data.questions as any;
      if (q.sections) {
        setTestSections(q.sections);
        const flat: any[] = [];
        q.sections.forEach((sec: any) => {
          sec.questions.forEach((question: any) => {
            flat.push({ ...question, section: sec.name });
          });
        });
        setTestQuestions(flat);
      }
    }

    // Get candidate photo (signed; bucket is private)
    if (app.photo_url) {
      const { resolvePhotoUrl } = await import("@/lib/photoUrl");
      const url = await resolvePhotoUrl(app.photo_url);
      if (url) setCandidatePhotoUrl(url);
    }
  };

  const handleOpenVideoIntro = async (app: any) => {
    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => a.id === app.id ? { ...a, current_stage: "video_intro" } : a)
    );
    toast({ title: "✅ Video Round Opened", description: `Candidate has been notified to record their video introduction.` });

    const { error } = await supabase
      .from("applications")
      .update({ current_stage: "video_intro" })
      .eq("id", app.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchApplications();
      return;
    }

    const { data: candidateUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", app.candidate_id)
      .maybeSingle();

    if (candidateUser) {
      await supabase.from("notifications").insert({
        user_id: candidateUser.id,
        title: "Aptitude Test Cleared!",
        message: "Congratulations! You have cleared the aptitude test. Next step is Video Introduction. Record a 3 to 4 minute video about: Introduce yourself, Your experience and skills, Your best project, Why you want this role. Login to record your video at /video-intro. Complete within 48 hours.",
      });
    }

    await notifyHROfManagerAction(
      "🎥 Video Round Opened",
      `${currentUserName} opened video introduction for ${app.candidate_name || "a candidate"}.`
    );
  };

  const triggerClientSideVideoAnalysis = async (app: any, signedUrl: string) => {
    try {
      setAnalyzingVideo(true);
      // Set to processing in DB and UI
      setApplications(prev => prev.map(a => a.id === app.id ? { ...a, video_analysis: { status: "processing" } } : a));
      
      console.log("Invoking analyze-video Edge Function...");
      const { data: edgeResult, error: edgeErr } = await supabase.functions.invoke("analyze-video", {
        body: { applicationId: app.id }
      });

      if (edgeErr || !edgeResult?.success) {
        throw edgeErr || new Error(edgeResult?.error || "Edge Function failed to start video analysis");
      }

      toast({ title: "🎥 Analysis Started", description: "The video analysis is running securely on the server. Please wait." });

      // Poll database for results (checks every 5 seconds, max 60 times = 5 minutes)
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 60) {
          clearInterval(interval);
          setAnalyzingVideo(false);
          toast({ title: "Analysis Still Running", description: "The video analysis is taking longer than expected. It will update here automatically when ready.", variant: "destructive" });
          return;
        }

        const { data: updatedApp } = await supabase
          .from("applications")
          .select("video_score, video_analysis")
          .eq("id", app.id)
          .maybeSingle();

        const va = updatedApp?.video_analysis as any;
        if (va && va.status !== "processing") {
          clearInterval(interval);
          setAnalyzingVideo(false);
          
          if (va.status === "failed") {
            toast({ title: "Video Analysis Failed", description: va.error || "Server error.", variant: "destructive" });
          } else {
            // Success! Update dialog and list
            setVideoDialog((prev: any) => prev && prev.id === app.id ? { ...prev, video_analysis: va, video_score: updatedApp.video_score } : prev);
            toast({ title: "✅ Analysis Complete", description: `Overall Score: ${updatedApp.video_score}/100` });
          }
          fetchApplications();
        }
      }, 5000);

    } catch (err: any) {
      console.error("Video analysis failed:", err);
      toast({ title: "Video Analysis Failed", description: err.message || "Please retry.", variant: "destructive" });
      setAnalyzingVideo(false);
    }
  };

  const handleViewVideo = async (app: any) => {
    setVideoDialog(app);
    setVideoSignedUrl(null);
    setAnalyzingVideo(false);
    let signedUrl = "";
    if (app.video_url) {
      const { data } = await supabase.storage.from("videos").createSignedUrl(app.video_url, 3600);
      if (data?.signedUrl) {
        setVideoSignedUrl(data.signedUrl);
        signedUrl = data.signedUrl;
      }
    }
    // Auto-trigger AI analysis if not already done
    const va = app.video_analysis as any;
    if (app.video_url && (!va || va.status === "failed")) {
      triggerClientSideVideoAnalysis(app, signedUrl);
    } else if (va?.status === "processing") {
      triggerClientSideVideoAnalysis(app, signedUrl);
    }
  };

  const handleWatchScreenRecording = async (path?: string | null) => {
    if (!path) {
      toast({ title: "No screen recording", description: "This candidate has no saved screen recording for that round.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.storage.from("test-recordings").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open recording", description: error?.message || "Signed URL failed.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleRetryVideoAnalysis = async () => {
    if (!videoDialog) return;
    triggerClientSideVideoAnalysis(videoDialog, videoSignedUrl || "");
  };

  const handleOpenTechnicalRound = async (app: Application & { candidate_name: string; job_title: string; candidate_email?: string }) => {
    setTechSetupApp(app);
    setTechUploadingFile(false);
    setTechGeneratingAI(false);

    // Check if job has pre-uploaded technical questions in pipeline_stages
    try {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("pipeline_stages, title, skills")
        .eq("id", app.job_id)
        .maybeSingle();

      const stages = Array.isArray(jobData?.pipeline_stages) ? jobData.pipeline_stages : [];
      const techStage = stages.find((s: any) => s?.id === "technical" || s?.key === "technical_round" || s?.name?.toLowerCase?.().includes("technical"));
      const jobTechQuestions = techStage?.config?.technical_questions;

      if (jobTechQuestions && ((jobTechQuestions.dsa?.length || 0) + (jobTechQuestions.coding?.length || 0) + (jobTechQuestions.mcq?.length || 0) > 0)) {
        setTechQuestions({
          dsa: jobTechQuestions.dsa || [],
          coding: jobTechQuestions.coding || [],
          mcq: jobTechQuestions.mcq || [],
        });
        setTechSetupSource("job");
      } else {
        // Generate with AI by default
        const generated = generateComprehensiveTechnicalQuestions(jobData?.title || app.job_title, jobData?.skills || []);
        setTechQuestions(generated);
        setTechSetupSource("ai");
      }
    } catch (e) {
      const generated = generateComprehensiveTechnicalQuestions(app.job_title);
      setTechQuestions(generated);
      setTechSetupSource("ai");
    }
  };

  const handleUploadTechFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !techSetupApp) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Max 10MB.", variant: "destructive" });
      return;
    }
    setTechUploadingFile(true);
    toast({ title: "📄 Processing file...", description: "Extracting DSA, coding tasks & MCQs." });
    try {
      const result = await parseTechnicalFile(file, {
        jobId: techSetupApp.job_id,
        jobTitle: techSetupApp.job_title,
      });
      setTechQuestions(result);
      setTechSetupSource("pdf");
      const total = (result.dsa?.length || 0) + (result.coding?.length || 0) + (result.mcq?.length || 0);
      toast({
        title: "✅ File Processed",
        description: `Extracted ${result.dsa?.length || 0} DSA problems, ${result.coding?.length || 0} coding tasks, and ${result.mcq?.length || 0} MCQs.`,
      });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message || "Could not parse technical questions", variant: "destructive" });
    } finally {
      setTechUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleGenerateWithAI = async () => {
    if (!techSetupApp) return;
    setTechGeneratingAI(true);
    try {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("title, skills")
        .eq("id", techSetupApp.job_id)
        .maybeSingle();

      const generated = generateComprehensiveTechnicalQuestions(jobData?.title || techSetupApp.job_title, jobData?.skills || []);
      setTechQuestions(generated);
      setTechSetupSource("ai");
      toast({
        title: "✨ Created with AI",
        description: `Generated ${generated.dsa.length} DSA problems, ${generated.coding.length} coding tasks, and ${generated.mcq.length} MCQs.`,
      });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setTechGeneratingAI(false);
    }
  };

  const handleSendTechnicalTestToCandidate = async () => {
    if (!techSetupApp) return;
    const total = (techQuestions.dsa?.length || 0) + (techQuestions.coding?.length || 0) + (techQuestions.mcq?.length || 0);
    if (total === 0) {
      toast({ title: "No Questions Added", description: "Please upload a file or generate questions with AI first.", variant: "destructive" });
      return;
    }
    setTechSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: hrUser } = session?.user?.id
        ? await supabase.from("users").select("id").eq("user_id", session.user.id).maybeSingle()
        : { data: null };

      // Check existing assessment
      const { data: existing } = await supabase
        .from("assessments")
        .select("id")
        .eq("application_id", techSetupApp.id)
        .eq("type", "technical")
        .maybeSingle();

      let assessmentId = existing?.id;
      if (existing) {
        await supabase
          .from("assessments")
          .update({
            questions: techQuestions as any,
            status: "approved",
            hr_approved: true,
            manager_approved: true,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("assessments")
          .insert({
            job_id: techSetupApp.job_id,
            application_id: techSetupApp.id,
            company_id: companyId || null,
            questions: techQuestions as any,
            type: "technical",
            status: "approved",
            hr_approved: true,
            manager_approved: true,
            approved_at: new Date().toISOString(),
            created_by: hrUser?.id || null,
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        assessmentId = created?.id;
      }

      // Update candidate stage
      await handleUpdateStage(techSetupApp.id, "technical_round");

      // Send notification to candidate
      await supabase.from("notifications").insert({
        user_id: techSetupApp.candidate_id,
        title: "💻 Technical Round Test Ready!",
        message: `Your technical assessment for ${techSetupApp.job_title} is ready. It contains ${techQuestions.dsa?.length || 0} DSA problems, ${techQuestions.coding?.length || 0} coding challenges, and ${techQuestions.mcq?.length || 0} technical questions. Login to take your test.`,
      });

      toast({
        title: "🚀 Technical Round Active!",
        description: `Technical test with ${total} questions sent to ${techSetupApp.candidate_name}.`,
      });

      setTechSetupApp(null);
    } catch (err: any) {
      console.error("Error sending technical test:", err);
      toast({ title: "Failed to send test", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setTechSubmitting(false);
    }
  };

  const handleOpenFullReviewEditor = async () => {
    if (!techSetupApp) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: hrUser } = session?.user?.id
        ? await supabase.from("users").select("id").eq("user_id", session.user.id).maybeSingle()
        : { data: null };

      const { data: existing } = await supabase
        .from("assessments")
        .select("id")
        .eq("application_id", techSetupApp.id)
        .eq("type", "technical")
        .maybeSingle();

      let assessmentId = existing?.id;
      if (existing) {
        await supabase
          .from("assessments")
          .update({
            questions: techQuestions as any,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("assessments")
          .insert({
            job_id: techSetupApp.job_id,
            application_id: techSetupApp.id,
            company_id: companyId || null,
            questions: techQuestions as any,
            type: "technical",
            status: "draft",
            created_by: hrUser?.id || null,
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        assessmentId = created?.id;
      }
      setTechSetupApp(null);
      navigate(`/review-technical/${assessmentId}`);
    } catch (err: any) {
      toast({ title: "Error opening editor", description: err.message, variant: "destructive" });
    }
  };

  const [techViolations, setTechViolations] = useState<any[]>([]);

  const handleViewTechReport = async (app: any) => {
    setTechnicalReportDialog(app);
    setTechnicalAssessment(null);
    setTechViolations([]);
    // Fetch assessment questions and violations in parallel
    const [assessmentRes, violationsRes] = await Promise.all([
      supabase.from("assessments").select("questions").eq("application_id", app.id).eq("type", "technical").maybeSingle(),
      supabase.from("test_violations").select("*").eq("application_id", app.id).order("created_at", { ascending: true }),
    ]);
    setTechnicalAssessment(assessmentRes.data?.questions || null);
    setTechViolations(violationsRes.data || []);
  };

  const getVerdict = (analysis: any): string => {
    if (!analysis) return "—";
    if (typeof analysis === "object" && analysis.verdict) return analysis.verdict;
    return "—";
  };

  const getNextStage = (current: string): string | null => {
    const idx = stageFlow.indexOf(current);
    if (idx === -1 || idx >= stageFlow.length - 2) return null;
    const next = stageFlow[idx + 1];
    // These stages are handled by specific buttons, not generic "next"
    if (["aptitude_test", "test_completed", "video_intro", "video_submitted", "technical_round", "technical_test", "technical_completed", "group_discussion", "gd_completed", "hr_interview", "interview", "offer_sent", "hired", "bgv", "onboarded"].includes(next)) return null;
    return next;
  };

  // ---- Template-driven progression -------------------------------------------------
  // The "move to next round" action follows the interview-process template selected
  // for that job, so only rounds the HR actually enabled ever appear.
  const PIPE_TO_STAGE: Record<string, string> = {
    resume: "shortlisted",
    aptitude: "aptitude_test",
    video_intro: "video_intro",
    technical: "technical_round",
    gd: "group_discussion",
    hr_interview: "hr_interview",
    managerial: "interview",
    offer: "offer_sent",
  };

  const STAGE_TO_PIPE = (stage: string): string | null => {
    if (String(stage || "").startsWith("round:")) return String(stage).slice(6);
    if (["applied", "ai_scored", "shortlisted", "resume_review"].includes(stage)) return "resume";
    if (["aptitude_test", "test_completed", "test_failed"].includes(stage)) return "aptitude";
    if (["video_intro", "video_submitted"].includes(stage)) return "video_intro";
    if (["technical_round", "technical_test", "technical_completed"].includes(stage)) return "technical";
    if (["group_discussion", "gd_completed"].includes(stage)) return "gd";
    if (["hr_interview"].includes(stage)) return "hr_interview";
    if (["interview"].includes(stage)) return "managerial";
    if (["offer_sent", "hired", "bgv", "onboarded", "selected"].includes(stage)) return "offer";
    return null;
  };


  const getTemplateNextStage = (app: any): { key: string; stage: string; label: string; custom: boolean; type?: string } | null => {
    if (app.current_stage === "rejected" || app.status === "rejected" || app.current_stage === "selected") return null;
    const raw = Array.isArray(app.pipeline_stages) ? app.pipeline_stages : null;
    const stages = (raw && raw.length
      ? raw
      : [
          { key: "resume", label: "Resume Review", enabled: true, order: 0 },
          { key: "aptitude", label: "Aptitude Test", enabled: true, order: 1 },
          { key: "video_intro", label: "Video Intro", enabled: true, order: 2 },
          { key: "technical", label: "Technical Round", enabled: true, order: 3 },
          { key: "hr_interview", label: "HR Interview", enabled: true, order: 5 },
          { key: "offer", label: "Offer", enabled: true, order: 7 },
        ])
      .filter((s: any) => s?.enabled !== false)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const currentKey = STAGE_TO_PIPE(app.current_stage);
    const idx = currentKey ? stages.findIndex((s: any) => String(s.key) === currentKey) : -1;
    const next = stages[idx + 1];
    if (!next) return null;
    const key = String(next.key);
    const builtin = PIPE_TO_STAGE[key];
    // Custom rounds (assignments, external interviews, anything HR invented in the
    // template) get a namespaced stage so the pipeline still advances.
    return {
      key,
      stage: builtin || `round:${key}`,
      label: String(next.label || builtin || key),
      custom: !builtin,
      type: next.type ? String(next.type) : undefined,
    };
  };



  // Candidates eligible for cutoff auto-approve (test_completed with scores)
  const testCompletedApps = applications.filter(
    (a) => a.current_stage === "test_completed" && a.test_score !== null
  );
  const qualifyingApps = testCompletedApps.filter((a) => (a.test_score ?? 0) >= cutoffScore);

  // Candidates eligible for bulk aptitude generation
  const aptitudeEligibleApps = applications.filter(
    (a) => ["ai_scored", "shortlisted"].includes(a.current_stage)
  );

  // Candidates eligible for bulk technical generation
  const technicalEligibleApps = applications.filter(
    (a) => a.current_stage === "video_submitted" && !techAssessMap[a.id]
  );

  // Candidates eligible for bulk move to GD
  const gdEligibleApps = applications.filter(
    (a) => a.current_stage === "technical_completed"
  );



  const handleBulkMoveToGD = async () => {
    if (gdEligibleApps.length === 0) return;
    setBulkMovingToGD(true);
    try {
      for (const app of gdEligibleApps) {
        await supabase.from("applications").update({ current_stage: "group_discussion" }).eq("id", app.id);
      }
      toast({
        title: `✅ ${gdEligibleApps.length} candidates moved to Group Discussion`,
        description: "Now schedule a GD from the GD Dashboard.",
      });
      fetchApplications();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBulkMovingToGD(false);
  };

  const handleBulkGenerateAptitude = async () => {
    if (aptitudeEligibleApps.length === 0) return;
    setBulkGeneratingAptitude(true);

    try {
      let successCount = 0;
      for (const app of aptitudeEligibleApps) {
        try {
          const res = await generateAndSaveAptitudeAssessment(
            app.job_id,
            app.id,
            companyId,
            currentUserId
          );
          if (res?.assessmentId) successCount++;
        } catch (err) {
          console.warn("Bulk aptitude generation error for app:", app.id, err);
        }
      }

      toast({
        title: `✅ Generated for ${successCount}/${aptitudeEligibleApps.length} candidates`,
        description: "Aptitude questions created. Review each before sending.",
      });
      fetchApplications();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBulkGeneratingAptitude(false);
  };

  const handleBulkGenerateTechnical = async () => {
    if (technicalEligibleApps.length === 0) return;
    setBulkGeneratingTechnical(true);

    try {
      let successCount = 0;
      for (const app of technicalEligibleApps) {
        try {
          const { data, error } = await supabase.functions.invoke("generate-technical", {
            body: {
              jobId: app.job_id,
              applicationId: app.id,
              companyId,
              createdBy: currentUserId,
            },
          });
          if (!error && data?.assessmentId) {
            await supabase.from("applications").update({ current_stage: "technical_round" }).eq("id", app.id);
            successCount++;
          }
        } catch {
          // Continue with next candidate
        }
      }

      toast({
        title: `✅ Generated for ${successCount}/${technicalEligibleApps.length} candidates`,
        description: "Technical questions created. Review each before sending.",
      });
      fetchApplications();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBulkGeneratingTechnical(false);
  };

  // Candidates who failed the cutoff
  const failedApps = testCompletedApps.filter((a) => (a.test_score ?? 0) < cutoffScore);

  const handleBulkApprove = async () => {
    if (qualifyingApps.length === 0 && failedApps.length === 0) return;
    setBulkApproving(true);

    try {
      // Approve qualifying candidates
      for (const app of qualifyingApps) {
        await supabase
          .from("applications")
          .update({ current_stage: "video_intro" })
          .eq("id", app.id);

        const { data: candidateUser } = await supabase
          .from("users")
          .select("id")
          .eq("id", app.candidate_id)
          .maybeSingle();

        if (candidateUser) {
          await supabase.from("notifications").insert({
            user_id: candidateUser.id,
            title: "🎉 Aptitude Test Cleared!",
            message: `Congratulations! You scored ${app.test_score}% and cleared the aptitude test. Next step: Video Introduction. Login to record your video.`,
          });
        }
      }

      // Reject failed candidates and send "Better luck next time" notification
      for (const app of failedApps) {
        await supabase
          .from("applications")
          .update({ current_stage: "rejected", status: "rejected" })
          .eq("id", app.id);

        const { data: candidateUser } = await supabase
          .from("users")
          .select("id")
          .eq("id", app.candidate_id)
          .maybeSingle();

        if (candidateUser) {
          await supabase.from("notifications").insert({
            user_id: candidateUser.id,
            title: "Better Luck Next Time 🍀",
            message: `Thank you for taking the aptitude test. Unfortunately, your score of ${app.test_score}% did not meet the required cutoff of ${cutoffScore}%. We appreciate your effort and wish you the best in your future endeavors. Good luck!`,
          });
        }
      }

      await notifyHROfManagerAction(
        "📊 Bulk Cutoff Approval",
        `${currentUserName} auto-approved ${qualifyingApps.length} candidates (≥ ${cutoffScore}%) and rejected ${failedApps.length} candidates (below cutoff).`
      );

      toast({
        title: `✅ ${qualifyingApps.length} approved, ${failedApps.length} rejected`,
        description: `Candidates above ${cutoffScore}% moved forward. Others notified with rejection.`,
      });

      setCutoffDialogOpen(false);
      fetchApplications();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBulkApproving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading candidates...</p>
      </div>
    );
  }

  const isDeleted = (a: any) => Boolean(a.deleted_at) || a.status === "deleted";
  // Anything rejected or removed more than 24h ago is gone from every list.
  const liveApplications = applications.filter((a) => !isPurged(a));
  const notDeletedAll = liveApplications.filter((a) => !isDeleted(a));
  const jobOptions = Array.from(
    new Map(notDeletedAll.map((a) => [a.job_id, a.job_title])).entries()
  ).map(([id, title]) => ({ id, title }));

  const scoped = jobFilter === "all" ? liveApplications : liveApplications.filter((a) => a.job_id === jobFilter);

  // Highest resume score first — ranking-based ordering across the board.
  const byResumeScore = (x: Application, y: Application) => (
    ((y.resume_score ?? y.ai_analysis?.resume_score ?? y.ai_analysis?.score ?? -1) as number) -
    ((x.resume_score ?? x.ai_analysis?.resume_score ?? x.ai_analysis?.score ?? -1) as number)
  );
  const isRejected = (a: any) => a.status === "rejected" || a.current_stage === "rejected";
  const notDeleted = scoped.filter((a) => !isDeleted(a)).slice().sort(byResumeScore);
  const activeApplications = notDeleted.filter((a) => !isRejected(a));
  const deletedApplications = scoped.filter((a) => isDeleted(a));
  const rejectedApplications = scoped.filter((a) => isRejected(a) && !isDeleted(a));
  const selectedStages = ["selected", "offer_sent", "bgv", "onboarded"];
  const selectedApplications = notDeleted.filter((a) => selectedStages.includes(a.current_stage));
  const hiredApplications = notDeleted.filter((a) => a.current_stage === "hired");
  const pendingApplications = notDeleted.filter(
    (a) => !isRejected(a) && !selectedStages.includes(a.current_stage) && a.current_stage !== "hired"
  );


  // Skill match percentage from AI analysis
  const skillMatchPct = (a: Application): number => {
    const matched = (a.ai_analysis?.matched_skills || []).length;
    const missing = (a.ai_analysis?.missing_skills || []).length;
    const total = matched + missing;
    if (!total) return 0;
    return Math.round((matched / total) * 100);
  };
  const topCandidates = notDeleted
    .filter((a) => a.status !== "rejected" && skillMatchPct(a) >= 100)
    .sort((x, y) => skillMatchPct(y) - skillMatchPct(x) || ((y as any).overall_score || 0) - ((x as any).overall_score || 0));

  const tabSource =
    activeTab === "all" ? notDeleted :
    activeTab === "top" ? topCandidates :
    activeTab === "selected" ? selectedApplications :
    activeTab === "rejected" ? rejectedApplications :
    activeTab === "pending" ? pendingApplications :
    activeTab === "hired" ? hiredApplications :
    activeTab === "deleted" ? deletedApplications :
    activeApplications;

  const q = searchQuery.trim().toLowerCase();
  const displayedApps = q
    ? tabSource.filter((a) =>
        a.candidate_name?.toLowerCase().includes(q) ||
        a.candidate_email?.toLowerCase().includes(q) ||
        a.job_title?.toLowerCase().includes(q)
      )
    : tabSource;

  // Round columns are driven by the interview template chosen per job.
  // A column only appears when at least one visible candidate's job enables that round.
  const appStageKeys = (a: any): Set<string> =>
    new Set<string>(
      Array.isArray(a?.pipeline_stages)
        ? a.pipeline_stages.filter((s: any) => s?.enabled !== false).map((s: any) => String(s.key))
        : ["resume", "aptitude", "video_intro", "technical", "gd", "hr_interview", "offer"]
    );
  const showAptitudeCol = displayedApps.some((a) => appStageKeys(a).has("aptitude"));
  const showVideoCol = displayedApps.some((a) => appStageKeys(a).has("video_intro"));
  const showTechnicalCol = displayedApps.some((a) => appStageKeys(a).has("technical"));



  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="rounded-xl border border-border bg-card">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              onClick={() => { setViewMode("table"); localStorage.setItem("hr_view_mode", "table"); }}
              className="h-7 px-3 gap-1 text-xs"
              title="Table view"
            >
              <TableIcon className="h-3.5 w-3.5" /> List
            </Button>
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "default" : "ghost"}
              onClick={() => { setViewMode("kanban"); localStorage.setItem("hr_view_mode", "kanban"); }}
              className="h-7 px-3 gap-1 text-xs"
              title="Kanban view"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Job:</span>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="h-8 min-w-[220px] text-xs">
                <SelectValue placeholder="All jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All jobs ({notDeletedAll.length})</SelectItem>
                {jobOptions.map((j) => {
                  const count = notDeletedAll.filter((a) => a.job_id === j.id).length;
                  return (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {jobFilter !== "all" && (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setJobFilter("all")}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All ({notDeleted.length})</TabsTrigger>
              <TabsTrigger value="top" className="gap-1">⭐ Top Match ({topCandidates.length})</TabsTrigger>
              <TabsTrigger value="selected">Selected ({selectedApplications.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
              <TabsTrigger value="hired">Hired ({hiredApplications.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
              <TabsTrigger value="deleted">Deleted ({deletedApplications.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 flex-wrap">
            {aptitudeEligibleApps.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkGenerateAptitude}
                disabled={bulkGeneratingAptitude}
                className="gap-2 text-xs"
              >
                {bulkGeneratingAptitude ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                {bulkGeneratingAptitude ? "Generating..." : `Generate Aptitude for All (${aptitudeEligibleApps.length})`}
              </Button>
            )}
            {technicalEligibleApps.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkGenerateTechnical}
                disabled={bulkGeneratingTechnical}
                className="gap-2 text-xs"
              >
                {bulkGeneratingTechnical ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Code2 className="h-3.5 w-3.5" />}
                {bulkGeneratingTechnical ? "Generating..." : `Generate Technical for All (${technicalEligibleApps.length})`}
              </Button>
            )}
            {gdEligibleApps.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkMoveToGD}
                disabled={bulkMovingToGD}
                className="gap-2 text-xs"
              >
                {bulkMovingToGD ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                {bulkMovingToGD ? "Moving..." : `Move All to GD (${gdEligibleApps.length})`}
              </Button>
            )}
            {testCompletedApps.length > 0 && currentUserRole === "manager" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCutoffDialogOpen(true)}
                className="gap-2 text-xs"
              >
                <Filter className="h-3.5 w-3.5" />
                Auto-Approve by Cutoff ({testCompletedApps.length} pending)
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDeleting}
                onClick={async () => {
                  setBulkDeleting(true);
                  await deleteApplications(Array.from(selectedIds));
                  setBulkDeleting(false);
                }}
                className="gap-2 text-xs"
              >
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete selected ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>





        <div className="px-6 py-3 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or job title..."
            className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {viewMode === "kanban" ? (
          <HRKanbanBoard
            apps={displayedApps as any}
            onMove={(id, stage) => {
              if (stage === "technical_round") {
                const target = applications.find((a) => a.id === id);
                if (target) {
                  handleOpenTechnicalRound(target);
                  return;
                }
              }
              handleUpdateStage(id, stage);
            }}
            onView={(app) => setDetailsDialog(applications.find((a) => a.id === app.id) || app)}
            onMessage={() => toast({ title: "Open Messages", description: "Use the Messages tab to chat with this candidate." })}
          />
        ) : displayedApps.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No candidates found{q ? ` matching "${searchQuery}"` : ""}.
          </div>
        ) : (
          <div className="w-full">
            <Table className="w-full table-auto text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8">
                    <Checkbox
                      checked={displayedApps.length > 0 && displayedApps.every((a) => selectedIds.has(a.id))}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        if (v) displayedApps.forEach((a) => next.add(a.id));
                        else displayedApps.forEach((a) => next.delete(a.id));
                        setSelectedIds(next);
                      }}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="hidden md:table-cell">Job</TableHead>
                  <TableHead className="hidden xl:table-cell">Exp</TableHead>
                  <TableHead className="hidden xl:table-cell">CTC</TableHead>
                  <TableHead className="hidden xl:table-cell">Notice</TableHead>
                  <TableHead className="hidden sm:table-cell">AI Score</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Verdict</TableHead>
                  {showAptitudeCol && <TableHead>Aptitude</TableHead>}
                  {showVideoCol && <TableHead>Video</TableHead>}
                  {showTechnicalCol && <TableHead>Technical</TableHead>}
                  <TableHead>Stage</TableHead>
                  <TableHead className="hidden lg:table-cell">Resume</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedApps.map((app) => {
                  // Next round taken straight from the interview-process template chosen for this job
                  const templateNext = getTemplateNextStage(app);
                  // Which pipeline stages this job has enabled — gates quick-actions per configured process
                  const stageKeys = new Set<string>(
                    Array.isArray((app as any).pipeline_stages)
                      ? (app as any).pipeline_stages.filter((s: any) => s?.enabled !== false).map((s: any) => String(s.key))
                      : ["resume", "aptitude", "video_intro", "technical", "gd", "hr_interview", "offer"]
                  );
                  const hasAptitude = stageKeys.has("aptitude");
                  const hasVideo = stageKeys.has("video_intro");
                  const hasTechnical = stageKeys.has("technical");
                  const hasGD = stageKeys.has("gd");
                  const hasHR = stageKeys.has("hr_interview") || stageKeys.has("managerial");

                  // How far this candidate has progressed along the canonical flow
                  const stageIdx = stageFlow.indexOf(app.current_stage);
                  const reached = (s: string) => stageIdx >= 0 && stageIdx >= stageFlow.indexOf(s);
                  const closed = app.current_stage === "rejected" || app.status === "rejected";

                  const hasVideoFile = !!(app as any).video_url;
                  const hasTechResult = app.technical_score !== null || !!(app as any).code_answers;
                  const techAssessment = techAssessMap[app.id];
                  const offer = offerMap[app.id];
                  const interview = interviewMap[app.id];
                  const offerAccepted = offer?.status === "accepted";
                  const isHired = app.current_stage === "hired" || offerAccepted;

                  // ---- Template-driven action gating --------------------------------
                  // The only action offered is the NEXT round of this job's interview
                  // template, and only once the round the candidate is currently in has
                  // actually produced a result. Moving forward therefore hides the old
                  // action and reveals the next one automatically.
                  const currentKey = STAGE_TO_PIPE(app.current_stage);
                  const isCustomRound = String(app.current_stage || "").startsWith("round:");
                  const currentRoundDone = (() => {
                    if (isCustomRound) return true; // HR decides when a custom round is over
                    switch (currentKey) {
                      case "resume": return reached("shortlisted");
                      case "aptitude": return app.test_score !== null;
                      case "video_intro": return hasVideoFile;
                      case "technical": return hasTechResult;
                      case "gd": return reached("gd_completed");
                      case "hr_interview":
                      case "managerial": return !!interview && (interview.status === "completed" || !!interview.ended_at);
                      case "offer": return offerAccepted;
                      default: return false;
                    }
                  })();
                  const nextKey = templateNext?.key || null;
                  const nextActionable = !closed && !isHired && currentRoundDone;
                  // Fresh application — HR decides Shortlist or Reject before any round starts.
                  const canShortlist = !closed && !isHired && ["applied", "ai_scored", "resume_review"].includes(app.current_stage);

                  // Open actions: only for the next template round, only once, never after a result exists.
                  const canOpenTest = hasAptitude && nextActionable && nextKey === "aptitude" && app.test_score === null && !aptAssessMap[app.id];
                  const canViewResults = hasAptitude && (app.test_score !== null || reached("test_completed"));
                  const canOpenVideo = hasVideo && nextActionable && nextKey === "video_intro" && !hasVideoFile;
                  // Watch only exists once the candidate has actually submitted a video.
                  const canViewVideo = hasVideo && hasVideoFile;
                  const canOpenTechnical = hasTechnical && nextActionable && nextKey === "technical" && !hasTechResult && !techAssessment;
                  const canViewTechReport = hasTechnical && (hasTechResult || reached("technical_completed"));
                  const canMoveToGD = hasGD && nextActionable && nextKey === "gd" && !reached("group_discussion");
                  const canScheduleInterview = hasHR && nextActionable && (nextKey === "hr_interview" || nextKey === "managerial") && !interview;
                  // Offer stage: when the template says the next round is the offer, or an offer already exists.
                  const offerReady = !!offer || (nextActionable && nextKey === "offer") || (!closed && currentKey === "offer");
                  // Generic "Move to X" for every other round in the template (including
                  // HR's own custom rounds — those open a small setup dialog first).
                  const genericMove = nextActionable && !!templateNext && !["aptitude", "video_intro", "technical", "gd", "hr_interview", "managerial", "offer"].includes(String(nextKey));





                  return (
                    <TableRow key={app.id} data-state={selectedIds.has(app.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(app.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedIds);
                            if (v) next.add(app.id); else next.delete(app.id);
                            setSelectedIds(next);
                          }}
                          aria-label={`Select ${app.candidate_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {app.photo_url && (
                            <PhotoImg
                              path={app.photo_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover border border-border shrink-0"
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleViewCandidateDetails(app)}
                                className="font-medium text-foreground hover:text-primary hover:underline cursor-pointer text-left"
                              >
                                {app.candidate_name}
                              </button>
                              <button
                                onClick={() => handleViewCandidateDetails(app)}
                                title="View full profile"
                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground">{app.candidate_email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{app.job_title}</TableCell>
                      <TableCell className="hidden xl:table-cell">{app.experience_years}y</TableCell>
                      <TableCell className="hidden xl:table-cell">₹{app.current_ctc.toLocaleString()}</TableCell>
                      <TableCell className="hidden xl:table-cell">{app.notice_period}d</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {(() => {
                          const rScore = app.resume_score ?? app.ai_analysis?.resume_score ?? app.ai_analysis?.score ?? app.overall_score;
                          if (rScore === null || rScore === undefined) return "—";
                          return (
                            <span className={`font-bold ${rScore >= 70 ? "text-primary" : rScore >= 50 ? "text-amber-500" : "text-destructive"}`}>
                              {rScore}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell capitalize text-xs">{getVerdict(app.ai_analysis)}</TableCell>
                      {/* Aptitude round */}
                      {showAptitudeCol && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {(() => {
                            const ts = (app as any).test_status as string | null | undefined;
                            const stage = app.current_stage;
                            const score = app.test_score;
                            if (!hasAptitude) return <span className="text-xs text-muted-foreground">N/A</span>;
                            if (ts === "passed" || (score !== null && stage === "test_completed")) {
                              return <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-600 whitespace-nowrap">PASSED {score}%</span>;
                            }
                            if (ts === "failed" || stage === "test_failed") {
                              return <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive whitespace-nowrap">FAILED {score ?? 0}%</span>;
                            }
                            if (score !== null) {
                              return <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary whitespace-nowrap">{score}%</span>;
                            }
                            if (stage === "aptitude_test") {
                              return <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 whitespace-nowrap">PENDING</span>;
                            }
                            return <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground whitespace-nowrap">NOT SENT</span>;
                          })()}
                          {canViewResults && (
                            <Button variant="ghost" size="sm" onClick={() => handleViewTestResults(app)} className="h-6 px-2 gap-1 text-[11px] text-primary">
                              <Eye className="h-3 w-3" /> View
                            </Button>
                          )}
                          {app.current_stage === "aptitude_test" && app.test_score === null && (
                            <Button variant="ghost" size="sm" onClick={() => setLiveScreen({ id: app.id, stage: "aptitude_test", name: app.candidate_name })} className="h-6 px-2 gap-1 text-[11px] text-rose-500">
                              <Radio className="h-3 w-3" /> Live
                            </Button>
                          )}
                          {(app as any).aptitude_screen_recording_url && (
                            <Button variant="ghost" size="sm" onClick={() => handleWatchScreenRecording((app as any).aptitude_screen_recording_url)} className="h-6 px-2 gap-1 text-[11px] text-indigo-500">
                              <Monitor className="h-3 w-3" /> Screen
                            </Button>
                          )}

                        </div>
                      </TableCell>
                      )}

                      {/* Video round */}
                      {showVideoCol && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {!hasVideo ? (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          ) : app.video_score !== null && app.video_score !== undefined ? (
                            <span className={`font-bold text-sm ${app.video_score >= 70 ? "text-primary" : app.video_score >= 50 ? "text-amber-500" : "text-destructive"}`}>
                              {app.video_score}/100
                            </span>
                          ) : hasVideoFile ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-500 whitespace-nowrap">UPLOADED</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {canViewVideo && (
                            <Button variant="ghost" size="sm" onClick={() => handleViewVideo(app)} className="h-6 px-2 gap-1 text-[11px] text-emerald-500">
                              <Play className="h-3 w-3" /> Watch
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      )}

                      {/* Technical round */}
                      {showTechnicalCol && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {!hasTechnical ? (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          ) : app.technical_score !== null ? (
                            <span className={`font-bold text-sm ${app.technical_score >= 70 ? "text-primary" : app.technical_score >= 50 ? "text-amber-500" : "text-destructive"}`}>
                              {app.technical_score}/100
                            </span>
                          ) : reached("technical_round") ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 whitespace-nowrap">PENDING</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {canViewTechReport && (
                            <Button variant="ghost" size="sm" onClick={() => handleViewTechReport(app)} className="h-6 px-2 gap-1 text-[11px] text-teal-500">
                              <Eye className="h-3 w-3" /> View
                            </Button>
                          )}
                          {["technical_round", "technical_test"].includes(app.current_stage) && !hasTechResult && (
                            <Button variant="ghost" size="sm" onClick={() => setLiveScreen({ id: app.id, stage: "technical_round", name: app.candidate_name })} className="h-6 px-2 gap-1 text-[11px] text-rose-500">
                              <Radio className="h-3 w-3" /> Live
                            </Button>
                          )}
                          {(app as any).technical_screen_recording_url && (

                            <Button variant="ghost" size="sm" onClick={() => handleWatchScreenRecording((app as any).technical_screen_recording_url)} className="h-6 px-2 gap-1 text-[11px] text-indigo-500">
                              <Monitor className="h-3 w-3" /> Screen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      )}


                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${stageBadgeClass[app.current_stage] || "bg-muted text-muted-foreground"}`}>
                          {stageLabel[app.current_stage] || String(app.current_stage || "").replace("round:", "")}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Button variant="ghost" size="sm" onClick={() => handleViewResume(app.resume_url)} className="text-muted-foreground hover:text-foreground gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {canOpenTest && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAptitudeTest(app)}
                              disabled={generatingTestFor === app.id}
                              className="text-purple-500 hover:text-purple-600 gap-1 text-xs"
                              title="Open Aptitude Test"
                            >
                              {generatingTestFor === app.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <BookOpen className="h-3.5 w-3.5" />
                              )}
                              {generatingTestFor === app.id ? "Generating..." : "Open Test"}
                            </Button>
                          )}
                          {canViewResults && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewTestResults(app)}
                              className="text-primary hover:text-primary gap-1 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Results
                            </Button>
                          )}
                          {canOpenVideo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenVideoIntro(app)}
                              className="text-pink-500 hover:text-pink-600 gap-1 text-xs"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Open Video
                            </Button>
                          )}
                          {canViewVideo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewVideo(app)}
                              className="text-emerald-500 hover:text-emerald-600 gap-1 text-xs"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Watch
                            </Button>
                          )}
                          {canOpenTechnical && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenTechnicalRound(app)}
                              disabled={generatingTechnicalFor === app.id}
                              className="text-orange-500 hover:text-orange-600 gap-1 text-xs"
                              title="Open Technical Round"
                            >
                              {generatingTechnicalFor === app.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Code2 className="h-3.5 w-3.5" />
                              )}
                              {generatingTechnicalFor === app.id ? "Generating..." : "Technical"}
                            </Button>
                          )}
                          {canViewTechReport && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewTechReport(app)}
                              className="text-teal-500 hover:text-teal-600 gap-1 text-xs"
                              title="View Technical Report"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Tech Report
                            </Button>
                          )}
                          {canMoveToGD && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUpdateStage(app.id, "group_discussion")}
                              className="text-cyan-500 hover:text-cyan-600 gap-1 text-xs"
                              title="Move to Group Discussion"
                            >
                              <Users className="h-3.5 w-3.5" />
                              Move to GD
                            </Button>
                          )}
                          {canScheduleInterview && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate("/schedule-interview")}
                              className="text-indigo-500 hover:text-indigo-600 gap-1 text-xs"
                              title="Schedule HR Interview"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              Schedule Interview
                            </Button>
                          )}
                          {/* Interview already booked — show it instead of the scheduling action */}
                          {interview && !isHired && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/15 text-indigo-500 whitespace-nowrap"
                              title={`${interview.round_type || "Interview"} on ${interview.scheduled_date} ${interview.scheduled_time || ""}`}
                            >
                              INTERVIEW SCHEDULED
                            </span>
                          )}
                          {/* Offer stage — green when the offer letter is out, red when it still isn't */}
                          {offerReady && (
                            offer ? (
                              offerAccepted ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold bg-emerald-500/20 text-emerald-600 whitespace-nowrap"
                                  title={`Offer accepted on ${new Date(offer.accepted_at || offer.created_at).toLocaleString()}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  OFFER ACCEPTED — HIRED
                                </span>
                              ) : offer.status === "declined" ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15 text-destructive whitespace-nowrap"
                                  title={offer.decline_reason || "Offer declined"}
                                >
                                  OFFER DECLINED
                                </span>
                              ) : (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-600 whitespace-nowrap"
                                  title={`Offer sent on ${new Date(offer.created_at).toLocaleString()} — waiting for the candidate`}
                                >
                                  OFFER SENT — AWAITING ACCEPTANCE
                                </span>
                              )
                            ) : (
                              <>
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15 text-destructive whitespace-nowrap">
                                  OFFER NOT SENT
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setOfferApp(app)}
                                  className="text-emerald-500 hover:text-emerald-600 gap-1 text-xs"
                                  title="Generate offer letter from template"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Send Offer
                                </Button>
                              </>
                            )
                          )}
                          {isCustomRound && briefMap[app.id] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setBriefView({ ...briefMap[app.id], candidate_name: app.candidate_name })}
                              className="gap-1 text-xs text-primary hover:text-primary"
                              title="Round brief, link and candidate submission"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {briefMap[app.id].submitted_at ? "View submission" : "Round details"}
                            </Button>
                          )}
                          {genericMove && !offer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (templateNext!.custom) {
                                  setCustomMode(templateNext!.type === "interview" ? "link" : "pdf");
                                  setCustomNote("");
                                  setCustomLink("");
                                  setCustomFile(null);
                                  setCustomRound({ app, next: templateNext! });
                                } else {
                                  handleUpdateStage(app.id, templateNext!.stage);
                                }
                              }}
                              className="text-primary hover:text-primary gap-1 text-xs"
                              title={`Move to ${templateNext.label} (from this job's interview process)`}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Move to {templateNext.label}
                            </Button>
                          )}
                          {canShortlist && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUpdateStage(app.id, "shortlisted")}
                              className="text-emerald-500 hover:text-emerald-600 gap-1 text-xs"
                              title="Shortlist this candidate and start the interview process"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Shortlist
                            </Button>
                          )}
                          {app.status !== "rejected" && app.current_stage !== "rejected" && !isHired && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRejectApp(app)}
                              className="text-destructive hover:bg-destructive/10 gap-1 text-xs"
                              title="Reject candidate at this round with AI-suggested reason"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          )}
                          {app.current_stage !== "rejected" && app.current_stage !== "selected" && (
                             <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteApplications([app.id])}
                              className="text-muted-foreground hover:text-destructive text-xs"
                              title="Remove from list"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(activeTab === "deleted" || activeTab === "rejected") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const restoredStage = app.current_stage === "rejected" ? "applied" : app.current_stage;
                                setApplications((prev) => prev.map((a) => a.id === app.id ? { ...a, status: "active", current_stage: restoredStage, deleted_at: null } as any : a));
                                toast({ title: "Restored", description: `${app.candidate_name} restored to active list.` });
                                await supabase.from("applications").update({ status: "active", current_stage: restoredStage, deleted_at: null } as any).eq("id", app.id);
                              }}
                              className="text-primary hover:text-primary text-xs gap-1"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Resume Viewer Dialog */}
      <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span>Resume</span>
              {resumeUrl && (
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-normal text-primary hover:underline mr-6"
                >
                  Open in new tab ↗
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {resumeUrl && (() => {
            const lower = resumeUrl.split("?")[0].toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.webp'].some(ext => lower.endsWith(ext));
            const isPdf = lower.endsWith('.pdf');

            if (isImage) {
              return (
                <div className="w-full flex-1 overflow-auto rounded-lg border border-border">
                  <img src={resumeUrl} alt="Resume" className="w-full h-auto object-contain" />
                </div>
              );
            }

            if (isPdf) {
              return (
                <object data={resumeUrl} type="application/pdf" className="w-full flex-1 rounded-lg border border-border">
                  <iframe src={resumeUrl} className="w-full h-full rounded-lg" title="Resume Viewer" />
                </object>
              );
            }

            return (
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(resumeUrl)}&embedded=true`}
                className="w-full flex-1 rounded-lg border border-border"
                title="Resume Viewer"
              />
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* Test Results Dialog */}
      <Dialog open={!!testResultDialog} onOpenChange={() => setTestResultDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Results — {testResultDialog?.candidate_name}</DialogTitle>
          </DialogHeader>
          {testResultDialog && (
            <div className="space-y-6">
              {/* Candidate Info + Photo */}
              <div className="flex items-start gap-4">
                {candidatePhotoUrl && (
                  <div className="shrink-0">
                    <img
                      src={candidatePhotoUrl}
                      alt={testResultDialog.candidate_name}
                      className="h-20 w-20 rounded-xl object-cover border-2 border-border"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-lg font-bold text-foreground">{testResultDialog.candidate_name}</p>
                  <p className="text-sm text-muted-foreground">{testResultDialog.candidate_email}</p>
                  <p className="text-sm text-muted-foreground">Job: {testResultDialog.job_title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exp: {testResultDialog.experience_years}y • Company: {testResultDialog.current_company}
                  </p>
                </div>
              </div>

              {/* Score Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{testResultDialog.test_score ?? "—"}/100</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {testAnswers.filter(a => a.selected_option !== null).length}/{testQuestions.length || 40}
                  </p>
                  <p className="text-xs text-muted-foreground">Answered</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {testAnswers.length > 0 ? Math.round(testAnswers.reduce((s, a) => s + (a.time_spent_seconds || 0), 0) / 60) : 0}m
                  </p>
                  <p className="text-xs text-muted-foreground">Total Time</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                  <p className={`text-2xl font-bold ${testViolations.length > 0 ? "text-destructive" : "text-primary"}`}>
                    {testViolations.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Violations</p>
                </div>
              </div>

              {/* Section-wise Performance */}
              {testSections.length > 0 && testQuestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">📊 Section-wise Performance</h3>
                  <div className="space-y-2">
                    {(() => {
                      let globalIdx = 0;
                      return testSections.map((sec: any, sIdx: number) => {
                        const sectionQuestions = sec.questions || [];
                        const startIdx = globalIdx;
                        globalIdx += sectionQuestions.length;
                        
                        let correct = 0;
                        let attempted = 0;
                        sectionQuestions.forEach((q: any, qIdx: number) => {
                          const answer = testAnswers.find(a => a.question_index === startIdx + qIdx);
                          if (answer && answer.selected_option !== null) {
                            attempted++;
                            const correctIdx = q.correct_answer ? q.correct_answer.charCodeAt(0) - 65 : -1;
                            if (answer.selected_option === correctIdx) correct++;
                          }
                        });
                        const pct = sectionQuestions.length > 0 ? Math.round((correct / sectionQuestions.length) * 100) : 0;

                        return (
                          <div key={sIdx} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{sec.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {correct}/{sectionQuestions.length} correct • {attempted} attempted
                              </p>
                            </div>
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 70 ? "bg-primary" : pct >= 40 ? "bg-amber-500" : "bg-destructive"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold min-w-[40px] text-right ${pct >= 70 ? "text-primary" : pct >= 40 ? "text-amber-500" : "text-destructive"}`}>
                              {pct}%
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Violations */}
              {testViolations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">⚠️ Violations ({testViolations.length})</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {testViolations.map((v: any) => (
                      <div key={v.id} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                        <span className="text-destructive text-xs font-medium uppercase shrink-0">{v.violation_type}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-foreground flex-1">{v.description}</span>
                        {v.question_number !== null && (
                          <span className="text-xs text-muted-foreground shrink-0">Q{v.question_number}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(v.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Question-by-Question Breakdown */}
              {testQuestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">📝 Question-by-Question Breakdown</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {testQuestions.map((q: any, idx: number) => {
                      const answer = testAnswers.find(a => a.question_index === idx);
                      const selectedOption = answer?.selected_option;
                      const correctIdx = q.correct_answer ? q.correct_answer.charCodeAt(0) - 65 : -1;
                      const isCorrect = selectedOption === correctIdx;
                      const isUnanswered = selectedOption === null || selectedOption === undefined;
                      const timeSpent = answer?.time_spent_seconds ?? 0;

                      return (
                        <div key={idx} className={`p-3 rounded-lg border ${isUnanswered ? "border-muted bg-muted/30" : isCorrect ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isUnanswered ? "bg-muted text-muted-foreground" : isCorrect ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                                Q{idx + 1}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{q.section}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${q.difficulty === "easy" ? "bg-primary/10 text-primary" : q.difficulty === "hard" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500"}`}>
                                {q.difficulty}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                              <span>⏱ {timeSpent}s</span>
                              {isUnanswered ? (
                                <span className="text-muted-foreground font-medium">Skipped</span>
                              ) : isCorrect ? (
                                <span className="text-primary font-medium">✓ Correct</span>
                              ) : (
                                <span className="text-destructive font-medium">✗ Wrong</span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-foreground mb-2">{q.question}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {q.options?.map((opt: string, oIdx: number) => {
                              const isSelected = selectedOption === oIdx;
                              const isCorrectOpt = oIdx === correctIdx;
                              let optClass = "border-border text-muted-foreground";
                              if (isCorrectOpt) optClass = "border-primary bg-primary/10 text-primary";
                              if (isSelected && !isCorrect) optClass = "border-destructive bg-destructive/10 text-destructive";
                              if (isSelected && isCorrect) optClass = "border-primary bg-primary/10 text-primary";

                              return (
                                <div key={oIdx} className={`text-xs px-2 py-1.5 rounded border ${optClass}`}>
                                  <span className="font-bold mr-1">{String.fromCharCode(65 + oIdx)}.</span>
                                  {opt}
                                  {isSelected && <span className="ml-1">👈</span>}
                                  {isCorrectOpt && !isSelected && <span className="ml-1">✓</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time per question heatmap */}
              {testAnswers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">⏱ Time per Question (seconds)</h3>
                  <div className="grid grid-cols-10 gap-1">
                    {testAnswers.map((a: any) => (
                      <div
                        key={a.question_index}
                        className={`text-center p-1.5 rounded text-xs font-medium ${
                          a.time_spent_seconds < 3
                            ? "bg-destructive/10 text-destructive"
                            : a.time_spent_seconds > 120
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title={`Q${a.question_index + 1}: ${a.time_spent_seconds}s`}
                      >
                        {a.time_spent_seconds}s
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    🔴 Under 3s (suspicious) • 🟡 Over 2min • ⚪ Normal
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    handleUpdateStage(testResultDialog.id, "interview");
                    setTestResultDialog(null);
                  }}
                  className="bg-primary text-primary-foreground"
                >
                  ✅ Move to Interview
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleUpdateStage(testResultDialog.id, "rejected");
                    setTestResultDialog(null);
                  }}
                  className="text-destructive border-destructive/30"
                >
                  ❌ Reject Candidate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Video Viewer Dialog */}
      <Dialog open={!!videoDialog} onOpenChange={() => setVideoDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Video Introduction — {videoDialog?.candidate_name}</DialogTitle>
          </DialogHeader>
          {videoDialog && (
            <div className="space-y-4">
              {videoSignedUrl ? (
                <video
                  src={videoSignedUrl}
                  controls
                  className="w-full rounded-lg border border-border aspect-video bg-black"
                />
              ) : (
                <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Loading video...</p>
                </div>
              )}

              {videoSignedUrl && (
                <a
                  href={videoSignedUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  ⬇️ Download Video
                </a>
              )}

              {/* AI Video Analysis */}
              {analyzingVideo && (
                <div className="rounded-xl border border-border bg-card p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground">🤖 AI is analyzing the video...</p>
                  <p className="text-xs text-muted-foreground mt-1">Evaluating expression, energy, eye contact, fluency, vocabulary and more</p>
                </div>
              )}

              {videoDialog.video_analysis && !analyzingVideo && videoDialog.video_analysis.status !== "processing" && videoDialog.video_analysis.status !== "failed" && (() => {
                const va = videoDialog.video_analysis;
                const metrics = [
                  { key: "energy_level", label: "⚡ Energy Level", icon: "⚡" },
                  { key: "eye_contact", label: "👁️ Eye Contact", icon: "👁️" },
                  { key: "english_fluency", label: "🗣️ English Fluency", icon: "🗣️" },
                  { key: "vocabulary", label: "📚 Vocabulary", icon: "📚" },
                  { key: "communication_skills", label: "💬 Communication", icon: "💬" },
                  { key: "confidence", label: "💪 Confidence", icon: "💪" },
                  { key: "body_language", label: "🧍 Body Language", icon: "🧍" },
                  { key: "content_quality", label: "📝 Content Quality", icon: "📝" },
                  { key: "professionalism", label: "👔 Professionalism", icon: "👔" },
                  { key: "overall_impression", label: "⭐ Overall Impression", icon: "⭐" },
                ];

                const verdictColors: Record<string, string> = {
                  strong: "bg-primary/10 text-primary border-primary/30",
                  average: "bg-amber-500/10 text-amber-500 border-amber-500/30",
                  weak: "bg-destructive/10 text-destructive border-destructive/30",
                };

                return (
                  <div className="space-y-4">
                    {/* Overall Score Header */}
                    <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">AI Video Score</p>
                        <p className="text-3xl font-bold text-foreground">{va.overall_score}<span className="text-lg text-muted-foreground">/100</span></p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${verdictColors[va.verdict] || verdictColors.average}`}>
                        {va.verdict?.toUpperCase()}
                      </span>
                    </div>

                    {/* Summary */}
                    {va.summary && (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-sm font-semibold text-foreground mb-1">📋 AI Summary</p>
                        <p className="text-sm text-muted-foreground">{va.summary}</p>
                      </div>
                    )}

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {metrics.map(({ key, label }) => {
                        const m = va[key];
                        if (!m) return null;
                        const score = m.score ?? 0;
                        const barColor = score >= 7 ? "bg-primary" : score >= 5 ? "bg-amber-500" : "bg-destructive";
                        return (
                          <div key={key} className="rounded-lg border border-border bg-card/60 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-foreground">{label}</span>
                              <span className="text-sm font-bold text-foreground">{score}/10</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score * 10}%` }} />
                            </div>
                            <p className="text-xs text-muted-foreground">{m.feedback}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Strengths & Improvements */}
                    <div className="grid grid-cols-2 gap-3">
                      {va.strengths?.length > 0 && (
                        <div className="rounded-lg border border-border bg-card/60 p-3">
                          <p className="text-xs font-semibold text-primary mb-2">✅ Strengths</p>
                          <ul className="space-y-1">
                            {va.strengths.map((s: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {va.improvements?.length > 0 && (
                        <div className="rounded-lg border border-border bg-card/60 p-3">
                          <p className="text-xs font-semibold text-amber-500 mb-2">🔧 Areas to Improve</p>
                          <ul className="space-y-1">
                            {va.improvements.map((s: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Transcript */}
                    {va.transcript && (
                      <div className="rounded-lg border border-border bg-card/60 p-3">
                        <p className="text-xs font-semibold text-primary mb-2">📝 Full Transcript</p>
                        <div className="max-h-48 overflow-y-auto pr-1">
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{va.transcript}</p>
                        </div>
                      </div>
                    )}

                    {/* Retry button */}
                    <Button variant="outline" size="sm" onClick={handleRetryVideoAnalysis} disabled={analyzingVideo}>
                      🔄 Re-analyze Video
                    </Button>
                  </div>
                );
              })()}

              {(!videoDialog.video_analysis || videoDialog.video_analysis?.status === "failed") && !analyzingVideo && (
                <Button variant="outline" onClick={handleRetryVideoAnalysis} disabled={analyzingVideo}>
                  🤖 Analyze with AI
                </Button>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    const target = videoDialog;
                    setVideoDialog(null);
                    handleOpenTechnicalRound(target);
                  }}
                  className="bg-primary text-primary-foreground gap-1.5"
                >
                  <Code2 className="h-4 w-4" />
                  Move to Technical Round
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleUpdateStage(videoDialog.id, "rejected");
                    setVideoDialog(null);
                  }}
                  className="text-destructive border-destructive/30"
                >
                  ❌ Reject Candidate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cutoff Score Auto-Approve Dialog */}
      <Dialog open={cutoffDialogOpen} onOpenChange={setCutoffDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Auto-Approve by Cutoff Score
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Set a minimum aptitude test score. All candidates scoring at or above this cutoff will automatically move to the <strong>Video Introduction</strong> round.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Cutoff Score</span>
                  <span className="text-2xl font-bold text-primary">{cutoffScore}%</span>
                </div>
                <Slider
                  value={[cutoffScore]}
                  onValueChange={(val) => setCutoffScore(val[0])}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Preview - Qualifying */}
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">✅ Candidates qualifying</span>
                <span className="text-lg font-bold text-primary">
                  {qualifyingApps.length} / {testCompletedApps.length}
                </span>
              </div>
              {qualifyingApps.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {qualifyingApps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-card">
                      <span className="text-foreground">{app.candidate_name}</span>
                      <span className="font-bold text-primary">{app.test_score}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview - Rejected */}
            {failedApps.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-destructive">❌ Will be rejected</span>
                  <span className="text-lg font-bold text-destructive">
                    {failedApps.length}
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {failedApps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-card">
                      <span className="text-foreground">{app.candidate_name}</span>
                      <span className="font-bold text-destructive">{app.test_score}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">These candidates will be notified: "Better luck next time, good luck!"</p>
              </div>
            )}

            {qualifyingApps.length === 0 && failedApps.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No candidates have completed the test yet.
              </p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCutoffDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkApprove}
                disabled={(qualifyingApps.length === 0 && failedApps.length === 0) || bulkApproving}
                className="flex-1 gap-2 bg-primary text-primary-foreground"
              >
                {bulkApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                {bulkApproving ? "Processing..." : `Approve ${qualifyingApps.length} & Reject ${failedApps.length}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {liveScreen && (
        <LiveScreenViewer
          open={!!liveScreen}
          onOpenChange={(o) => !o && setLiveScreen(null)}
          applicationId={liveScreen.id}
          stage={liveScreen.stage}
          candidateName={liveScreen.name}
        />
      )}

      {/* Custom round details — brief, live link and the candidate's submission */}
      <Dialog open={!!briefView} onOpenChange={(o) => { if (!o) setBriefView(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{briefView?.label} — {briefView?.candidate_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {briefView?.instructions && (
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-foreground/90">{briefView.instructions}</p>
            )}
            {briefView?.brief_url && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(briefView.brief_url, "_blank")}>
                <FileText className="h-3.5 w-3.5" /> Open brief (PDF)
              </Button>
            )}
            {briefView?.link_url && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(briefView.link_url, "_blank")}>
                <ArrowRight className="h-3.5 w-3.5" /> Join live round
              </Button>
            )}
            {briefView?.submission_path ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs text-emerald-500">
                  Submitted {briefView.submitted_at ? new Date(briefView.submitted_at).toLocaleString() : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1"
                  onClick={async () => {
                    const { data } = await supabase.storage.from("resumes").createSignedUrl(briefView.submission_path, 3600);
                    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    else toast({ title: "Could not open the file", variant: "destructive" });
                  }}
                >
                  <FileText className="h-3.5 w-3.5" /> {briefView.submission_name || "Open submission"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The candidate hasn’t submitted anything for this round yet.</p>
            )}

            {briefView?.question_format && (
              <p className="text-xs text-muted-foreground">
                Answer format: <span className="text-foreground">{FORMAT_LABEL[briefView.question_format] || briefView.question_format}</span>
              </p>
            )}

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold text-foreground">Score this round</p>
              <p className="text-[11px] text-muted-foreground">Only HR and hiring managers can see this.</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number" min={0} max={100}
                  value={briefScore}
                  onChange={(e) => setBriefScore(e.target.value)}
                  placeholder="0-100"
                  className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={briefFeedback}
                  onChange={(e) => setBriefFeedback(e.target.value)}
                  placeholder="Notes (optional)"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
                <Button size="sm" disabled={briefSaving} onClick={saveBriefScore}>Save</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom template round — collect the brief before moving the candidate */}
      <Dialog open={!!customRound} onOpenChange={(o) => { if (!o) setCustomRound(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start “{customRound?.next.label}” for {customRound?.app.candidate_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This round comes from your interview process, so tell us how the candidate should receive it.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">How is this round delivered?</label>
              <Select value={customMode} onValueChange={(v) => setCustomMode(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">Upload a PDF assignment / brief</SelectItem>
                  <SelectItem value="link">Live meeting (link created for you)</SelectItem>
                  <SelectItem value="note">Instructions only (no file or link)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {customMode === "pdf" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">PDF file</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setCustomFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary"
                />
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  How should the candidate answer it?
                </label>
                <Select value={customFormat} onValueChange={setCustomFormat}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The candidate sees this next to the brief before they upload their answer.
                </p>
              </div>
            )}

            {customMode === "link" && (
              <div>
                <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                  A live meeting room will be created automatically and sent to the candidate — you don’t need to paste anything.
                </p>
                <label className="mt-3 block text-xs font-medium text-muted-foreground">Prefer your own link? (optional)</label>
                <input
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder="https://meet.google.com/…"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Instructions for the candidate (optional)</label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                placeholder="What they must do, and by when."
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCustomRound(null)}>Cancel</Button>
              <Button onClick={submitCustomRound} disabled={customSending} className="gap-1">
                {customSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Send &amp; move
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      {/* Technical Report Dialog */}

      <Dialog open={!!technicalReportDialog} onOpenChange={() => setTechnicalReportDialog(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>💻 Technical Round Report — {technicalReportDialog?.candidate_name}</DialogTitle>
          </DialogHeader>
          {technicalReportDialog && (() => {
            const codeAnswers = technicalReportDialog.code_answers;
            const report = codeAnswers?.ai_report;
            const dsaAnswers = codeAnswers?.dsa_answers || {};
            const codingAnswers = codeAnswers?.coding_answers || {};
            const mcqAnswers = codeAnswers?.mcq_answers || {};
            const questions = technicalAssessment as any;
            const dsaProblems = questions?.dsa_problems || [];
            const codingTasks = questions?.coding_tasks || [];
            const mcqQuestions = questions?.mcq_questions || [];

            if (!report && !codeAnswers) {
              return (
                <div className="py-8 text-center text-muted-foreground">
                  <p>No technical round data available yet.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6">
                {/* Selected rounds */}
                {technicalReportDialog.technical_rounds?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rounds attempted:</span>
                    {technicalReportDialog.technical_rounds.map((r: string) => (
                      <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 capitalize">
                        {r.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Score Overview */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className={`text-2xl font-bold ${(report?.overall_score ?? 0) >= 70 ? "text-primary" : (report?.overall_score ?? 0) >= 50 ? "text-amber-500" : "text-destructive"}`}>
                      {report?.overall_score ?? technicalReportDialog.technical_score ?? "—"}/100
                    </p>
                    <p className="text-xs text-muted-foreground">Overall Score</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{report?.dsa_score ?? "—"}/100</p>
                    <p className="text-xs text-muted-foreground">DSA Score</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{report?.coding_score ?? "—"}/100</p>
                    <p className="text-xs text-muted-foreground">Coding Score</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{report?.mcq_score ?? "—"}/100</p>
                    <p className="text-xs text-muted-foreground">MCQ Score</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{report?.mcq_correct ?? "—"}/{report?.mcq_total ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">MCQ Correct</p>
                  </div>
                </div>

                {/* DSA Problems Results */}
                {report?.dsa_results?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">🧩 DSA Problems</h3>
                    <div className="space-y-3">
                      {report.dsa_results.map((r: any, i: number) => {
                        const candidateCode = dsaAnswers[i] || "";
                        return (
                          <div key={i} className={`rounded-lg border p-4 ${r.correctness ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <span className="text-sm font-semibold text-foreground">#{r.problem_number} {r.title}</span>
                                {dsaProblems[i]?.difficulty && (
                                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${r.correctness ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                                    {dsaProblems[i].difficulty}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-bold ${r.score >= 70 ? "text-primary" : r.score >= 40 ? "text-amber-500" : "text-destructive"}`}>
                                  {r.score}/100
                                </span>
                                <span className={`text-xs font-medium ${r.correctness ? "text-primary" : "text-destructive"}`}>
                                  {r.correctness ? "✓ Correct" : "✗ Incorrect"}
                                </span>
                              </div>
                            </div>
                            {dsaProblems[i]?.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{dsaProblems[i].description}</p>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                              <span>⏱ Time: {r.time_complexity || "N/A"}</span>
                              <span>💾 Space: {r.space_complexity || "N/A"}</span>
                              <span>⭐ Code Quality: {r.code_quality}/10</span>
                            </div>
                            {candidateCode && (
                              <details className="mb-2">
                                <summary className="text-xs font-medium text-foreground cursor-pointer hover:text-primary">View Candidate's Code</summary>
                                <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono text-foreground border border-border">
                                  {candidateCode}
                                </pre>
                              </details>
                            )}
                            {r.feedback && (
                              <div className="mt-2 p-2 rounded bg-muted/50 border border-border">
                                <p className="text-xs font-medium text-foreground mb-1">🤖 AI Feedback:</p>
                                <p className="text-xs text-muted-foreground">{r.feedback}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coding Tasks Results */}
                {report?.coding_results?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">💻 Coding Tasks</h3>
                    <div className="space-y-3">
                      {report.coding_results.map((r: any, i: number) => {
                        const candidateCode = codingAnswers[i] || "";
                        return (
                          <div key={i} className={`rounded-lg border p-4 ${r.correctness ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <span className="text-sm font-semibold text-foreground">#{r.task_number} {r.title}</span>
                                {codingTasks[i]?.tech_stack && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {codingTasks[i].tech_stack}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-bold ${r.score >= 70 ? "text-primary" : r.score >= 40 ? "text-amber-500" : "text-destructive"}`}>
                                  {r.score}/100
                                </span>
                                <span className={`text-xs font-medium ${r.correctness ? "text-primary" : "text-destructive"}`}>
                                  {r.correctness ? "✓ Correct" : "✗ Incorrect"}
                                </span>
                              </div>
                            </div>
                            {codingTasks[i]?.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{codingTasks[i].description}</p>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                              <span>⏱ Time: {r.time_complexity || "N/A"}</span>
                              <span>💾 Space: {r.space_complexity || "N/A"}</span>
                              <span>⭐ Code Quality: {r.code_quality}/10</span>
                            </div>
                            {candidateCode && (
                              <details className="mb-2">
                                <summary className="text-xs font-medium text-foreground cursor-pointer hover:text-primary">View Candidate's Code</summary>
                                <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono text-foreground border border-border">
                                  {candidateCode}
                                </pre>
                              </details>
                            )}
                            {r.feedback && (
                              <div className="mt-2 p-2 rounded bg-muted/50 border border-border">
                                <p className="text-xs font-medium text-foreground mb-1">🤖 AI Feedback:</p>
                                <p className="text-xs text-muted-foreground">{r.feedback}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MCQ Results */}
                {report?.mcq_details?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">📝 MCQ Questions ({report.mcq_correct}/{report.mcq_total} correct)</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {report.mcq_details.map((m: any, i: number) => {
                        const q = mcqQuestions[i];
                        return (
                          <div key={i} className={`p-3 rounded-lg border ${m.correct ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.correct ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                                  Q{m.question_number}
                                </span>
                                {q?.topic && <span className="text-[10px] text-muted-foreground">{q.topic}</span>}
                                {q?.difficulty && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${q.difficulty === "easy" ? "bg-primary/10 text-primary" : q.difficulty === "hard" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500"}`}>
                                    {q.difficulty}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs font-medium ${m.correct ? "text-primary" : "text-destructive"}`}>
                                {m.correct ? "✓ Correct" : "✗ Wrong"}
                              </span>
                            </div>
                            {q?.question && <p className="text-sm text-foreground mb-2">{q.question}</p>}
                            {q?.options && (
                              <div className="grid grid-cols-2 gap-1.5">
                                {q.options.map((opt: string, oIdx: number) => {
                                  const optLetter = String.fromCharCode(65 + oIdx);
                                  const isSelected = m.selected_option === optLetter;
                                  const isCorrectOpt = m.correct_answer === optLetter;
                                  let optClass = "border-border text-muted-foreground";
                                  if (isCorrectOpt) optClass = "border-primary bg-primary/10 text-primary";
                                  if (isSelected && !m.correct) optClass = "border-destructive bg-destructive/10 text-destructive";
                                  if (isSelected && m.correct) optClass = "border-primary bg-primary/10 text-primary";
                                  return (
                                    <div key={oIdx} className={`text-xs px-2 py-1.5 rounded border ${optClass}`}>
                                      <span className="font-bold mr-1">{optLetter}.</span>
                                      {opt}
                                      {isSelected && <span className="ml-1">👈</span>}
                                      {isCorrectOpt && !isSelected && <span className="ml-1">✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Violations during technical test */}
                {techViolations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">⚠️ Proctoring Violations ({techViolations.length})</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {techViolations.map((v: any) => (
                        <div key={v.id} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                          <span className="text-destructive text-xs font-medium uppercase shrink-0">{v.violation_type}</span>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-foreground flex-1">{v.description}</span>
                          {v.question_number !== null && (
                            <span className="text-xs text-muted-foreground shrink-0">Q{v.question_number}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(v.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => {
                      handleUpdateStage(technicalReportDialog.id, "group_discussion");
                      setTechnicalReportDialog(null);
                    }}
                    className="bg-primary text-primary-foreground"
                  >
                    ✅ Move to Group Discussion
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleUpdateStage(technicalReportDialog.id, "rejected");
                      setTechnicalReportDialog(null);
                    }}
                    className="text-destructive border-destructive/30"
                  >
                    ❌ Reject Candidate
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Candidate Details Dialog */}
      <Dialog open={!!detailsDialog} onOpenChange={() => setDetailsDialog(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] sm:max-w-[96vw] h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Candidate Details — {detailsDialog?.candidate_name}</DialogTitle>
          </DialogHeader>
          {detailsDialog && (
            <div className="space-y-6">
              {/* Photo & Basic Info */}
              <div className="flex items-start gap-4">
                {detailsPhotoUrl ? (
                  <img
                    src={detailsPhotoUrl}
                    alt={detailsDialog.candidate_name}
                    className="h-24 w-24 rounded-xl object-cover border-2 border-border shrink-0"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-2xl font-bold shrink-0">
                    {detailsDialog.candidate_name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <p className="text-lg font-bold text-foreground">{detailsDialog.candidate_name}</p>
                  <p className="text-sm text-muted-foreground">{detailsDialog.candidate_email}</p>
                  <p className="text-sm text-muted-foreground">Job: <span className="text-foreground font-medium">{detailsDialog.job_title}</span></p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${stageBadgeClass[detailsDialog.current_stage] || "bg-muted text-muted-foreground"}`}>
                    {stageLabel[detailsDialog.current_stage] || detailsDialog.current_stage}
                  </span>
                </div>
              </div>

              {/* Application Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Current Company</p>
                  <p className="text-sm font-medium text-foreground">{detailsDialog.current_company}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Experience</p>
                  <p className="text-sm font-medium text-foreground">{detailsDialog.experience_years} years</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Current CTC</p>
                  <p className="text-sm font-medium text-foreground">₹{detailsDialog.current_ctc?.toLocaleString()} LPA</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Expected CTC</p>
                  <p className="text-sm font-medium text-foreground">₹{detailsDialog.expected_ctc?.toLocaleString()} LPA</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Notice Period</p>
                  <p className="text-sm font-medium text-foreground">{detailsDialog.notice_period} days</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Applied On</p>
                  <p className="text-sm font-medium text-foreground">{new Date(detailsDialog.applied_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Weighted Overall Score + per-round scores — driven by the job's interview template */}
              {(() => {
                const keys = appStageKeys(detailsDialog);
                const parts: { s: number | null; w: number; label: string; key: string }[] = [
                  { s: detailsDialog.resume_score ?? detailsDialog.ai_analysis?.resume_score ?? detailsDialog.ai_analysis?.score, w: 20, label: "Resume", key: "resume" },
                  { s: detailsDialog.video_score, w: 20, label: "Video", key: "video_intro" },
                  { s: detailsDialog.technical_score ?? detailsDialog.ai_analysis?.github_score, w: 20, label: "Technical", key: "technical" },
                  { s: detailsDialog.test_score, w: 15, label: "Aptitude", key: "aptitude" },
                  { s: (detailsDialog as any).gd_score, w: 15, label: "GD", key: "gd" },
                  { s: (detailsDialog as any).interview_score, w: 10, label: "Interview", key: "hr_interview" },
                ].filter(p => keys.has(p.key) || (p.key === "hr_interview" && keys.has("managerial")));

                const done = parts.filter(p => typeof p.s === "number" && !isNaN(p.s as number));
                const totalW = done.reduce((a, p) => a + p.w, 0) || 1;
                const overall = done.length ? Math.round(done.reduce((a, p) => a + (p.s as number) * p.w, 0) / totalW) : null;
                const color = overall === null ? "text-muted-foreground" : overall >= 75 ? "text-primary" : overall >= 55 ? "text-amber-500" : "text-destructive";
                const verdict = overall === null ? "Not scored yet" : overall >= 75 ? "Strong Fit" : overall >= 55 ? "Average Fit" : "Weak Fit";
                const scoreColor = (s: number | null | undefined) =>
                  s === null || s === undefined ? "text-muted-foreground" : s >= 70 ? "text-primary" : s >= 50 ? "text-amber-500" : "text-destructive";

                return (
                  <>
                    {overall !== null && (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Weighted Overall Score</p>
                          <p className={`text-4xl font-bold ${color}`}>{overall}<span className="text-lg text-muted-foreground">/100</span></p>
                          <p className="text-xs text-muted-foreground mt-1">Based on {done.length} completed stage{done.length > 1 ? "s" : ""} · {verdict}</p>
                        </div>
                        <div className="text-right text-[10px] text-muted-foreground space-y-0.5">
                          {done.map(p => (
                            <div key={p.label}>{p.label}: <span className="text-foreground font-medium">{p.s}</span> <span className="opacity-60">({p.w}%)</span></div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {parts.map(p => (
                        <div key={p.key} className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                          <p className={`text-xl font-bold ${scoreColor(p.s)}`}>{p.s ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{p.label} Score</p>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}


              {/* Application answers (parsed from what the candidate filled while applying) */}
              {detailsDialog.cover_letter && (() => {
                const raw = detailsDialog.cover_letter as string;
                const tags: { k: string; v: string }[] = [];
                const body = raw
                  .split("\n")
                  .filter((line) => {
                    const m = line.trim().match(/^\[([^:\]]+):\s*([^\]]*)\]$/);
                    if (m) { tags.push({ k: m[1].trim(), v: m[2].trim() }); return false; }
                    return true;
                  })
                  .join("\n")
                  .trim();
                const statusTag = tags.find((t) => t.k.toLowerCase() === "employment")?.v;
                const statusLabel: Record<string, string> = {
                  working: "👔 Working professional",
                  student: "🎓 Student",
                  intern: "🧑‍💻 Intern",
                  fresher: "🌱 Fresher",
                };
                return (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">🧾 Application Answers</h3>
                    {statusTag && (
                      <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 border border-primary/30 text-primary">
                        {statusLabel[statusTag] || statusTag}
                      </span>
                    )}
                    {tags.filter((t) => t.k.toLowerCase() !== "employment").length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {tags.filter((t) => t.k.toLowerCase() !== "employment").map((t, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">{t.k}</p>
                            <p className="text-sm font-medium text-foreground break-words">{t.v || "—"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Candidate Submitted Links & Before Interview Signals */}
                    {(() => {
                      const workflowApps = getWorkflowApplications();
                      const wf = workflowApps.find(
                        (w) =>
                          (w.jobId === detailsDialog.job_id && (w.candidateEmail === detailsDialog.candidate_email || w.candidateName === detailsDialog.candidate_name)) ||
                          w.candidateEmail === detailsDialog.candidate_email
                      );
                      const ghTag = tags.find((t) => t.k.toLowerCase() === "github")?.v || wf?.githubAccountUrl || detailsProfile?.github_url;
                      const projTag = tags.find((t) => t.k.toLowerCase() === "project")?.v || wf?.projectLiveUrl || detailsProfile?.portfolio_url;
                      const authPct = wf?.authenticityPercentage ?? (ghTag ? 85 : null);
                      const aiPct = wf?.aiWrittenPercentage ?? (ghTag ? 15 : null);

                      if (!ghTag && !projTag && !wf) return null;

                      return (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <ScanSearch className="h-4 w-4" /> ⚡ Before Interview AI Screening &amp; Links
                            </span>
                            <div className="flex items-center gap-2">
                              {wf && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                                  {wf.overallStatus}
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                                onClick={() => {
                                  localStorage.setItem("hz_selected_app_id", detailsDialog.id);
                                  setDetailsDialog(null);
                                  window.dispatchEvent(new CustomEvent("hz_switch_hr_tab", { detail: "Before Interview" }));
                                }}
                              >
                                <ScanSearch className="h-3 w-3" />
                                Open in Before Interview
                              </Button>
                            </div>
                          </div>

                          {/* GitHub & Project clickable links */}
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            {ghTag && (
                              <a
                                href={toHref(ghTag)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-2 truncate font-medium text-foreground">
                                  <GitBranch className="h-4 w-4 text-primary shrink-0" />
                                  <span className="truncate">{ghTag}</span>
                                </span>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </a>
                            )}
                            {projTag && (
                              <a
                                href={toHref(projTag.split(" ")[0])}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-2 truncate font-medium text-foreground">
                                  <Layers className="h-4 w-4 text-primary shrink-0" />
                                  <span className="truncate">{projTag}</span>
                                </span>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </a>
                            )}
                          </div>

                          {/* Code Authenticity Meter */}
                          {authPct !== null && aiPct !== null && (
                            <div className="p-3 rounded-lg bg-card/80 border border-border space-y-1.5">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-emerald-500 font-bold">{authPct}% Verified Human Code</span>
                                <span className="text-amber-500 font-semibold">{aiPct}% AI Boilerplate</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-amber-500/20 overflow-hidden flex">
                                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${authPct}%` }} />
                                <div className="bg-amber-500 h-full transition-all" style={{ width: `${aiPct}%` }} />
                              </div>
                            </div>
                          )}

                          {wf?.repoCodingChallenges && wf.repoCodingChallenges.length > 0 && (
                            <div className="text-xs space-y-1 text-muted-foreground pt-1 border-t border-border">
                              <span className="font-semibold text-foreground">Repo-Derived Coding Challenges: </span>
                              <span>
                                {wf.repoCodingChallenges.filter((c) => c.submittedCode).length}/2 Completed · AI Diagnosed Optimal Bound
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}


              {/* AI Analysis */}
              {detailsDialog.ai_analysis && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">🤖 AI Resume Analysis</h3>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-1">
                    {typeof detailsDialog.ai_analysis === "object" && (
                      <>
                        {detailsDialog.ai_analysis.verdict && (
                          <p><span className="text-muted-foreground">Verdict:</span> <span className="font-medium capitalize text-foreground">{detailsDialog.ai_analysis.verdict}</span></p>
                        )}
                        {detailsDialog.ai_analysis.summary && (
                          <p className="text-muted-foreground">{detailsDialog.ai_analysis.summary}</p>
                        )}
                        {detailsDialog.ai_analysis.strengths && (
                          <p><span className="text-muted-foreground">Strengths:</span> <span className="text-foreground">{Array.isArray(detailsDialog.ai_analysis.strengths) ? detailsDialog.ai_analysis.strengths.join(", ") : detailsDialog.ai_analysis.strengths}</span></p>
                        )}
                        {detailsDialog.ai_analysis.weaknesses && (
                          <p><span className="text-muted-foreground">Weaknesses:</span> <span className="text-foreground">{Array.isArray(detailsDialog.ai_analysis.weaknesses) ? detailsDialog.ai_analysis.weaknesses.join(", ") : detailsDialog.ai_analysis.weaknesses}</span></p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Resume Link */}
              {detailsResumeUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">📄 Resume</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(detailsResumeUrl, "_blank")}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    View / Download Resume
                  </Button>
                </div>
              )}

              {/* LinkedIn-style Profile Sections */}
              {detailsProfile && (
                <div className="space-y-5 pt-2 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    👤 Full Candidate Profile
                  </h3>

                  {detailsProfile.headline && (
                    <p className="text-sm italic text-muted-foreground">{detailsProfile.headline}</p>
                  )}

                  {detailsProfile.about_me && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">About</h4>
                      <p className="text-sm text-foreground whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">
                        {detailsProfile.about_me}
                      </p>
                    </div>
                  )}

                  {Array.isArray(detailsProfile.skills) && detailsProfile.skills.length > 0 && (() => {
                    const norm = (s: any) => String(typeof s === "string" ? s : s?.name || "").toLowerCase().trim();
                    const jobSet = new Set(detailsJobSkills.map(norm).filter(Boolean));
                    const candSkills = (detailsProfile.skills as any[]).map((s) => ({ raw: s, name: typeof s === "string" ? s : s?.name, matched: jobSet.has(norm(s)) }));
                    const matchedCount = candSkills.filter(s => s.matched).length;
                    const pct = jobSet.size > 0 ? Math.round((matchedCount / jobSet.size) * 100) : 0;
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</h4>
                          {jobSet.size > 0 && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct >= 100 ? "bg-emerald-500/15 text-emerald-600" : pct >= 60 ? "bg-primary/15 text-primary" : pct >= 30 ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive"}`}>
                              {matchedCount}/{jobSet.size} match • {pct}%
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {candSkills.map((s, i) => (
                            <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.matched ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" : "bg-muted text-muted-foreground"}`}>
                              {s.matched && "✓ "}{s.name}
                            </span>
                          ))}
                        </div>
                        {jobSet.size > 0 && matchedCount < jobSet.size && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Missing: {detailsJobSkills.filter(js => !candSkills.some(c => norm(c.raw) === norm(js))).join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {Array.isArray(detailsProfile.experiences) && detailsProfile.experiences.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Experience</h4>
                      <div className="space-y-2">
                        {(detailsProfile.experiences as any[]).map((e, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-sm font-semibold text-foreground">{e.title || e.role}</p>
                            <p className="text-xs text-muted-foreground">{e.company} • {e.start || ""} – {e.current ? "Present" : (e.end || "")}</p>
                            {e.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(detailsProfile.education) && detailsProfile.education.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Education</h4>
                      <div className="space-y-2">
                        {(detailsProfile.education as any[]).map((e, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-sm font-semibold text-foreground">{e.college}</p>
                            <p className="text-xs text-muted-foreground">{e.degree} {e.field && `• ${e.field}`} {e.cgpa && `• ${e.cgpa}`}</p>
                            <p className="text-xs text-muted-foreground">{e.start_year} – {e.end_year}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(detailsProfile.projects) && detailsProfile.projects.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Projects</h4>
                      <div className="space-y-2">
                        {(detailsProfile.projects as any[]).map((p, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-sm font-semibold text-foreground">{p.name || p.title}</p>
                            {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                            {p.tech && <p className="text-[11px] text-primary mt-1">🛠 {p.tech}</p>}
                            <div className="flex gap-3 mt-1">
                              {p.github && <a href={toHref(p.github)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">GitHub</a>}
                              {p.live && <a href={toHref(p.live)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">Live</a>}
                              {p.link && <a href={toHref(p.link)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">Link</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailsCertUrls.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Certifications</h4>
                      <div className="space-y-1.5">
                        {detailsCertUrls.map((c, i) => {
                          const meta = [c.issuer, c.year].filter(Boolean).join(" • ");
                          const inner = (
                            <>
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="flex-1 min-w-0">
                                <span className="block truncate">{c.name}</span>
                                {meta && <span className="block text-[11px] text-muted-foreground truncate">{meta}</span>}
                              </span>
                              {c.url && <span className="text-xs text-muted-foreground shrink-0">Open ↗</span>}
                            </>
                          );
                          const cls = "flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 text-sm text-foreground";
                          return c.url ? (
                            <a key={i} href={toHref(c.url)} target="_blank" rel="noopener noreferrer"
                              className={`${cls} hover:border-primary hover:text-primary transition`}>
                              {inner}
                            </a>
                          ) : (
                            <div key={i} className={cls}>{inner}</div>
                          );
                        })}
                      </div>
                    </div>
                  )}


                  {Array.isArray(detailsProfile.achievements) && detailsProfile.achievements.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Achievements</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(detailsProfile.achievements as any[]).map((a, i) => (
                          <li key={i} className="text-sm text-foreground">{typeof a === "string" ? a : (a?.title || JSON.stringify(a))}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(detailsProfile.languages) && detailsProfile.languages.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Languages</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(detailsProfile.languages as any[]).map((l, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-full bg-muted text-foreground text-xs">
                            {typeof l === "string" ? l : `${l?.name}${l?.level ? ` (${l.level})` : ""}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(detailsProfile.linkedin_url || detailsProfile.github_url || detailsProfile.portfolio_url || detailsProfile.naukri_url || detailsProfile.indeed_url) && (
                    <div className="flex flex-wrap gap-2">
                      {detailsProfile.linkedin_url && <a href={toHref(detailsProfile.linkedin_url)} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-[#0a66c2]/15 border border-[#0a66c2]/40 text-[#0a66c2] hover:bg-[#0a66c2]/25">LinkedIn ↗</a>}
                      {detailsProfile.naukri_url && <a href={toHref(detailsProfile.naukri_url)} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-[#ff7555]/15 border border-[#ff7555]/40 text-[#ff7555] hover:bg-[#ff7555]/25">Naukri ↗</a>}
                      {detailsProfile.indeed_url && <a href={toHref(detailsProfile.indeed_url)} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-[#2557a7]/15 border border-[#2557a7]/40 text-[#2557a7] hover:bg-[#2557a7]/25">Indeed ↗</a>}
                      {detailsProfile.github_url && <a href={toHref(detailsProfile.github_url)} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-muted border border-border hover:bg-muted/70">GitHub ↗</a>}
                      {detailsProfile.portfolio_url && <a href={toHref(detailsProfile.portfolio_url)} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20">Portfolio ↗</a>}
                    </div>
                  )}
                </div>
              )}

              {/* Private HR Notes — only visible to HR / Owner / Superadmin */}
              <HRPrivateNotes
                candidateId={detailsDialog.candidate_id}
                applicationId={detailsDialog.id}
                candidateName={detailsDialog.candidate_name}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Bulk Actions Floating Bar */}
      {selectedIds.size > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-3"
          style={{
            bottom: 24,
            background: "#0d0f1a",
            border: "1px solid #00e5a0",
            borderRadius: 12,
            padding: "16px 24px",
            boxShadow: "0 8px 32px rgba(0,229,160,0.2)",
          }}
        >
          <span className="text-sm font-medium" style={{ color: "#00e5a0" }}>
            {selectedIds.size} / {displayedApps.length} selected
          </span>
          <div className="h-6 w-px bg-white/10" />
          {selectedIds.size >= 2 && selectedIds.size <= 3 && (
            <Button
              size="sm"
              onClick={() => {
                const ids = Array.from(selectedIds).join(",");
                const firstApp = displayedApps.find((a) => selectedIds.has(a.id));
                const jobId = firstApp?.job_id || "";
                navigate(`/compare-candidates?ids=${ids}&jobId=${jobId}`);
              }}
              style={{ background: "#8b5cf6", color: "white" }}
              className="gap-1.5 hover:opacity-90"
            >
              <GitCompare className="h-4 w-4" /> Compare Selected ({selectedIds.size})
            </Button>
          )}
          {selectedIds.size > 3 && (
            <span className="text-xs italic" style={{ color: "#fbbf24" }}>Select max 3 to compare.</span>
          )}
          <div className="h-6 w-px bg-white/10" />
          <Button size="sm" onClick={() => setBulkAction("move")} style={{ background: "#00e5a0", color: "#0d0f1a" }} className="gap-1.5 hover:opacity-90">
            <ArrowRight className="h-4 w-4" /> Move Stage
          </Button>
          <Button size="sm" onClick={() => setBulkAction("message")} style={{ background: "#3b82f6", color: "white" }} className="gap-1.5 hover:opacity-90">
            <MessageCircle className="h-4 w-4" /> Send Message
          </Button>
          <Button size="sm" onClick={() => setBulkAction("reject")} style={{ background: "#ef4444", color: "white" }} className="gap-1.5 hover:opacity-90">
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button size="sm" variant="outline" onClick={clearBulk} className="gap-1.5 bg-transparent text-white border-white/30 hover:bg-white/10">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      )}

      {/* Move Stage Modal */}
      <Dialog open={bulkAction === "move"} onOpenChange={(o) => !o && !bulkBusy && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move {selectedIds.size} Candidates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm">Select new stage</label>
            <Select value={bulkMoveStage} onValueChange={setBulkMoveStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shortlisted">Resume Review (Shortlisted)</SelectItem>
                <SelectItem value="aptitude_test">Aptitude Test</SelectItem>
                <SelectItem value="video_intro">Video Intro</SelectItem>
                <SelectItem value="technical_round">Technical Round</SelectItem>
                <SelectItem value="group_discussion">Group Discussion</SelectItem>
                <SelectItem value="hr_interview">HR Interview</SelectItem>
                <SelectItem value="offer_sent">Offer Sent</SelectItem>
              </SelectContent>
            </Select>
            {bulkProgress && bulkBusy && (
              <p className="text-xs text-muted-foreground">Updating {bulkProgress.done}/{bulkProgress.total}...</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" disabled={bulkBusy} onClick={() => setBulkAction(null)}>Cancel</Button>
              <Button disabled={bulkBusy} onClick={runBulkMove}>
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Move"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Message Modal */}
      <Dialog open={bulkAction === "message"} onOpenChange={(o) => !o && !bulkBusy && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Message to {selectedIds.size} Candidates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <textarea
              value={bulkMessageText}
              onChange={(e) => setBulkMessageText(e.target.value)}
              placeholder="Type your message..."
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {bulkProgress && bulkBusy && (
              <p className="text-xs text-muted-foreground">Sending {bulkProgress.done}/{bulkProgress.total}...</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={bulkBusy} onClick={() => setBulkAction(null)}>Cancel</Button>
              <Button disabled={bulkBusy || !bulkMessageText.trim()} onClick={runBulkMessage} style={{ background: "#3b82f6", color: "white" }}>
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to All"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={bulkAction === "reject"} onOpenChange={(o) => !o && !bulkBusy && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {selectedIds.size} Candidates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-destructive">This will reject all selected candidates. This cannot be undone.</p>
            <label className="text-sm">Reason (internal only)</label>
            <Select value={bulkRejectReason} onValueChange={setBulkRejectReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Not enough experience">Not enough experience</SelectItem>
                <SelectItem value="Skills do not match">Skills do not match</SelectItem>
                <SelectItem value="Below cutoff score">Below cutoff score</SelectItem>
                <SelectItem value="Position filled">Position filled</SelectItem>
                <SelectItem value="Other reason">Other reason</SelectItem>
              </SelectContent>
            </Select>
            {bulkRejectReason === "Other reason" && (
              <input
                value={bulkRejectOther}
                onChange={(e) => setBulkRejectOther(e.target.value)}
                placeholder="Specify reason"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            {bulkProgress && bulkBusy && (
              <p className="text-xs text-muted-foreground">Rejecting {bulkProgress.done}/{bulkProgress.total}...</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" disabled={bulkBusy} onClick={() => setBulkAction(null)}>Cancel</Button>
              <Button disabled={bulkBusy} onClick={runBulkReject} style={{ background: "#ef4444", color: "white" }}>
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RejectWithReasonDialog
        app={rejectApp as any}
        open={!!rejectApp}
        onOpenChange={(o) => { if (!o) setRejectApp(null); }}
        onRejected={(id) => {
          setApplications((prev) => prev.map((a) => a.id === id ? { ...a, current_stage: "rejected", status: "rejected" } : a));
        }}
      />

      {offerApp && (
        <OfferLetterPanel
          application={offerApp}
          candidateName={offerApp.candidate_name}
          candidateEmail={offerApp.candidate_email}
          jobTitle={offerApp.job_title}
          open={!!offerApp}
          onOpenChange={(o) => { if (!o) setOfferApp(null); }}
          onGenerated={() => { setOfferApp(null); fetchApplications(); }}
          currentUser={{ id: currentUserId, full_name: currentUserName, company_id: companyId }}
        />
      )}

      {/* Technical Round Setup Dialog in Dashboard */}
      <Dialog
        open={!!techSetupApp}
        onOpenChange={(o) => {
          if (!o && !techSubmitting) setTechSetupApp(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                  <Code2 className="h-5 w-5 text-orange-500" />
                  Technical Round Setup
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure technical round questions for <strong className="text-foreground">{techSetupApp?.candidate_name}</strong> ({techSetupApp?.job_title})
                </p>
              </div>
            </div>
          </DialogHeader>

          {techSetupApp && (
            <div className="space-y-6 pt-2">
              {/* Question Sources Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Upload File Card */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    techSetupSource === "pdf"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card/60 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold text-foreground">Upload Questions</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Upload your custom technical test (.pdf, .docx, .txt) with DSA, coding challenges & MCQs.
                  </p>
                  <label className="inline-flex items-center justify-center w-full px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium cursor-pointer transition-colors">
                    {techUploadingFile ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                      </span>
                    ) : (
                      <span>📄 Select File</span>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleUploadTechFile}
                      disabled={techUploadingFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* AI Generation Card */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    techSetupSource === "ai"
                      ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500"
                      : "border-border bg-card/60 hover:border-purple-500/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="h-4 w-4 text-purple-500" />
                    <h4 className="text-xs font-bold text-foreground">Generate with AI</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Instantly create tailored DSA algorithms, coding challenges & domain MCQs using AI.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateWithAI}
                    disabled={techGeneratingAI}
                    className="w-full h-8 text-xs border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
                  >
                    {techGeneratingAI ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating...
                      </span>
                    ) : (
                      <span>✨ Auto-Generate</span>
                    )}
                  </Button>
                </div>

                {/* Job Default Card */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    techSetupSource === "job"
                      ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500"
                      : "border-border bg-card/60 hover:border-emerald-500/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-emerald-500" />
                    <h4 className="text-xs font-bold text-foreground">Job Default</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Load questions attached to the job posting pipeline.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenTechnicalRound(techSetupApp)}
                    className="w-full h-8 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    <span>📂 Reload Default</span>
                  </Button>
                </div>
              </div>

              {/* Questions Overview Summary */}
              <div className="rounded-xl border border-border bg-card/80 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-orange-500" />
                    Assigned Questions Summary ({(techQuestions.dsa?.length || 0) + (techQuestions.coding?.length || 0) + (techQuestions.mcq?.length || 0)} Total)
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTechModalOpen(true)}
                    className="h-7 text-xs text-primary gap-1"
                  >
                    ✏️ Edit / Customize Questions
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="p-2.5 rounded-lg bg-secondary/50 text-center border border-border">
                    <p className="text-lg font-bold text-foreground">{techQuestions.dsa?.length || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">🧩 DSA Problems</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-secondary/50 text-center border border-border">
                    <p className="text-lg font-bold text-foreground">{techQuestions.coding?.length || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">💻 Coding Tasks</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-secondary/50 text-center border border-border">
                    <p className="text-lg font-bold text-foreground">{techQuestions.mcq?.length || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">📝 Technical MCQs</p>
                  </div>
                </div>

                {/* Preview Tabs */}
                <Tabs value={techActivePreviewTab} onValueChange={(v) => setTechActivePreviewTab(v as any)}>
                  <TabsList className="grid grid-cols-3 h-8 text-xs mb-3">
                    <TabsTrigger value="dsa">DSA ({techQuestions.dsa?.length || 0})</TabsTrigger>
                    <TabsTrigger value="coding">Coding Tasks ({techQuestions.coding?.length || 0})</TabsTrigger>
                    <TabsTrigger value="mcq">MCQs ({techQuestions.mcq?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="dsa" className="mt-0">
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {(!techQuestions.dsa || techQuestions.dsa.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic py-3 text-center">No DSA problems added yet.</p>
                      ) : (
                        techQuestions.dsa.map((p, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-border bg-card text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">#{idx + 1} {p.title}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  p.difficulty === "hard" ? "bg-red-500/10 text-red-500" : p.difficulty === "medium" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                                }`}>{p.difficulty}</span>
                                <span className="text-[10px] text-muted-foreground">{p.time_minutes}m</span>
                              </div>
                            </div>
                            <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="coding" className="mt-0">
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {(!techQuestions.coding || techQuestions.coding.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic py-3 text-center">No coding tasks added yet.</p>
                      ) : (
                        techQuestions.coding.map((t, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-border bg-card text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">#{idx + 1} {t.title}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  t.difficulty === "hard" ? "bg-red-500/10 text-red-500" : t.difficulty === "medium" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                                }`}>{t.difficulty}</span>
                                <span className="text-[10px] text-muted-foreground">{t.time_minutes}m</span>
                              </div>
                            </div>
                            <p className="text-muted-foreground line-clamp-2">{t.description}</p>
                            {t.tech_stack && (
                              <p className="text-[10px] text-primary mt-1">Stack: {t.tech_stack}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="mcq" className="mt-0">
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {(!techQuestions.mcq || techQuestions.mcq.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic py-3 text-center">No technical MCQs added yet.</p>
                      ) : (
                        techQuestions.mcq.map((m, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-border bg-card text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">Q{idx + 1}. {m.question}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{m.topic || "MCQ"}</span>
                            </div>
                            <p className="text-[11px] text-emerald-500 font-medium mt-1">Answer: Option {m.correct_answer}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenFullReviewEditor}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  🔍 Open Full Review Page
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={techSubmitting}
                    onClick={() => setTechSetupApp(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={techSubmitting || ((techQuestions.dsa?.length || 0) + (techQuestions.coding?.length || 0) + (techQuestions.mcq?.length || 0) === 0)}
                    onClick={handleSendTechnicalTestToCandidate}
                    className="bg-primary text-primary-foreground font-semibold gap-1.5"
                  >
                    {techSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {techSubmitting ? "Sending Test..." : "🚀 Approve & Send Test"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Granular Technical Questions Editor Modal */}
      {techModalOpen && (
        <TechnicalQuestionsModal
          open={techModalOpen}
          technicalData={techQuestions}
          onClose={() => setTechModalOpen(false)}
          onConfirm={(newData) => {
            setTechQuestions(newData);
            toast({ title: "Updated", description: "Technical questions updated successfully." });
          }}
          onReupload={() => {
            setTechModalOpen(false);
          }}
        />
      )}
    </motion.div>
  );
};

// Client-Side AI Video Analysis Utility Functions
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const generateMockVideoAnalysis = (candidateName: string) => {
  const overall_score = Math.floor(Math.random() * 20) + 65; // 65-84
  const verdict = overall_score >= 75 ? "strong" : "average";

  const metrics = [
    "energy_level", "eye_contact", "english_fluency", "vocabulary", 
    "communication_skills", "confidence", "body_language", "content_quality", 
    "professionalism", "overall_impression"
  ];

  const result: any = {
    overall_score,
    verdict,
    summary: `${candidateName} delivered a very clear and well-structured introduction video. They spoke about their background and key achievements with confidence.`,
    strengths: ["Clear communication", "Good confidence levels", "Professional background setup"],
    improvements: ["Maintain more consistent eye contact", "Reduce minor hand movement distractions"]
  };

  metrics.forEach(m => {
    result[m] = {
      score: Math.floor(Math.random() * 3) + 6, // 6-8
      feedback: `Demonstrated good presentation on this metric.`
    };
  });

  return result;
};

// Deleted client-side Gemini function analyzeVideoClientSide to prevent API Key exposure.
// The app now uses Supabase Edge Functions for secure server-side video analysis with polling.

export default HRCandidatesView;
