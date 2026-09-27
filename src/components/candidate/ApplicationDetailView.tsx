import { CheckCircle2, Clock, Lock, ExternalLink, ArrowLeft, Building2, MapPin, Briefcase, Calendar, FileText, XCircle, Trophy, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/useLiveData";
import { useToast } from "@/hooks/use-toast";
import { normalizePipeline, enabledStages, type PipelineStage } from "@/lib/pipeline";

// How the hiring team wants a PDF-based round answered
const FORMAT_LABEL: Record<string, string> = {
  mcq: "Multiple choice (MCQ)",
  coding: "Coding / programming",
  fill_blanks: "Fill in the blanks",
  descriptive: "Written / descriptive answers",
  mixed: "Mixed question types",
};

const STAGE_DESC: Record<string, string> = {
  resume: "AI scoring your resume against job skills",
  aptitude: "Online proctored aptitude assessment",
  video_intro: "3-4 min recorded introduction",
  technical: "DSA / Coding / MCQ evaluation",
  gd: "Live group discussion with other candidates",
  hr_interview: "Final HR conversation",
  managerial: "Round with the hiring manager",
  offer: "Offer issued / onboarding",
};

// Map arbitrary application.current_stage strings to a pipeline stage key
const normalize = (raw: string): string => {
  if (!raw) return "resume";
  const r = String(raw).toLowerCase();
  if (r.startsWith("round:")) return r.slice(6);
  if (["applied", "ai_scored", "shortlisted", "resume_review", "resume_completed", "screening"].includes(r)) return "resume";
  if (r.startsWith("test") || r.startsWith("aptitude")) return "aptitude";
  if (r.startsWith("video")) return "video_intro";
  if (r.startsWith("technical")) return "technical";
  if (r.startsWith("gd") || r.startsWith("group_discussion")) return "gd";
  if (r.startsWith("interview") || r.startsWith("hr_")) return "hr_interview";
  if (r.startsWith("manager")) return "managerial";
  if (["offer_sent", "hired", "selected", "bgv", "onboarded", "offer_letter", "offer"].includes(r)) return "offer";
  return r;
};


const prepKeyFor = (key: string): string | null =>
  key === "aptitude" ? "aptitude_test" :
  key === "video_intro" ? "video_intro" :
  key === "technical" ? "technical_round" :
  key === "gd" ? "group_discussion" :
  key === "hr_interview" || key === "managerial" ? "hr_interview" :
  null;

interface Props {
  app: any;
  gdInfo?: any;
  submittedTest?: boolean;
  onBack: () => void;
}

export default function ApplicationDetailView({ app, gdInfo, submittedTest, onBack }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const raw = app?.current_stage || "applied";
  const stage = normalize(raw);
  const appId = app?.id || "";

  // Details HR attached to custom rounds (brief PDF, live link, instructions)
  const [briefs, setBriefs] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingStage = useRef<string | null>(null);

  const loadBriefs = async () => {
    if (!appId) return;
    try {
      const { data } = await (supabase as any)
        .from("round_briefs")
        .select("*")
        .eq("application_id", appId);
      const map: Record<string, any> = {};
      (data || []).forEach((b: any) => { map[b.stage_key] = b; });
      setBriefs(map);
    } catch (e) {
      console.warn("Could not load briefs", e);
    }
  };

  useEffect(() => {
    if (appId) loadBriefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useLiveData(
    appId ? [{ table: "round_briefs", filter: `application_id=eq.${appId}` }] : [],
    () => loadBriefs(),
    { key: `app-briefs-${appId || "none"}`, enabled: !!appId },
  );

  const handleSubmissionFile = async (file: File) => {
    const stageKey = pendingStage.current;
    const brief = stageKey ? briefs[stageKey] : null;
    if (!brief) return;
    setUploading(stageKey);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      const path = `${uid}/round-submissions/${brief.id}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error } = await (supabase as any)
        .from("round_briefs")
        .update({ submission_path: path, submission_name: file.name, submitted_at: new Date().toISOString() })
        .eq("id", brief.id);
      if (error) throw error;
      await loadBriefs();
      toast({ title: "Submitted", description: "The hiring team can now see your answer." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploading(null);
      pendingStage.current = null;
    }
  };

  if (!app) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">Select an application from the inbox above to view full details.</p>
      </div>
    );
  }

  const job = app.jobs || {};
  const company = job.companies || {};

  // Rounds come from the interview-process template HR picked for THIS job.
  let parsedStages = job.pipeline_stages;
  if (typeof parsedStages === "string") {
    try {
      parsedStages = JSON.parse(parsedStages);
    } catch {}
  }
  const STAGES: PipelineStage[] = Array.isArray(parsedStages) && parsedStages.length > 0
    ? enabledStages(normalizePipeline(parsedStages))
    : defaultPipeline();

  // A round counts as finished when the candidate actually produced a result
  // for it, regardless of what current_stage string the backend last wrote.
  const stageDone = (s: PipelineStage): boolean => {
    if (!s) return false;
    const rScore = app.resume_score ?? app.ai_analysis?.resume_score ?? app.ai_analysis?.score;
    const gScore = app.technical_score ?? app.ai_analysis?.github_score;
    switch (s.type) {
      case "screening": return rScore != null;
      case "test": return app.test_score != null;
      case "video": return app.video_score != null || !!app.video_url;
      case "technical": return gScore != null;
      case "interview": return app.interview_score != null;
      default: return false;
    }
  };

  const rawIdx = STAGES.findIndex((s) => s.key === stage);
  // Fallback when current_stage doesn't map to any template stage: land on the
  // round right after the last one with a recorded result.
  let lastDone = -1;
  STAGES.forEach((s, i) => { if (stageDone(s)) lastDone = i; });
  const currentIdx = rawIdx >= 0 ? rawIdx : Math.max(0, Math.min(lastDone + 1, Math.max(0, STAGES.length - 1)));
  const rejected = app.status === "rejected";
  const hired = ["hired", "selected", "onboarded"].includes(raw) || app.status === "hired";
  const rejectedStage = app.rejection_stage ? normalize(app.rejection_stage) : null;
  const rejectionIdx = rejectedStage ? STAGES.findIndex((s) => s.key === rejectedStage) : -1;

  return (
    <div className="space-y-6">
      {/* Top bar with back + title */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </Button>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
          rejected ? "bg-destructive/10 text-destructive"
          : hired ? "bg-green-500/15 text-green-500"
          : "bg-primary/10 text-primary"
        }`}>
          {rejected ? "Rejected" : hired ? "Hired" : STAGES[currentIdx]?.label || stage}
        </span>
      </div>

      {/* Job header card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-foreground">{job.title || "Application"}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {company.company_name || "—"}</span>
              {job.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {job.location}</span>}
              {job.department && <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {job.department}</span>}
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Applied {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "Recently"}</span>
            </div>
          </div>
          {job.salary_min && job.salary_max && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">CTC Range</p>
              <p className="text-lg font-bold text-primary">
                ₹{Number(job.salary_min).toLocaleString()} – ₹{Number(job.salary_max).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Score chips — only for rounds that exist in this job's template */}
        {(() => {
          const scoreFor = (s: PipelineStage): number | null | undefined => {
            const rScore = app.resume_score ?? app.ai_analysis?.resume_score ?? app.ai_analysis?.score;
            if (s.key === "before_interview") return rScore ?? app.ai_analysis?.github_score;
            if (s.type === "screening") return rScore;
            if (s.type === "test") return app.test_score;
            if (s.type === "video") return app.video_score;
            if (s.type === "technical") return app.technical_score ?? app.ai_analysis?.github_score;
            if (s.type === "interview") return app.interview_score;
            return undefined;
          };
          const rScore = app.resume_score ?? app.ai_analysis?.resume_score ?? app.ai_analysis?.score;
          const chips = STAGES
            .map((s) => ({ label: s.label, v: scoreFor(s) }))
            .filter((c) => c.v !== undefined)
            .concat([{ label: "Overall", v: app.overall_score ?? rScore }]);
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-5">
              {chips.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-background/40 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {s.v != null ? `${s.v}` : "—"}
                    {s.v != null && <span className="text-xs text-muted-foreground">/100</span>}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Rejection / Hired banner */}
      {rejected && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-destructive">
                Application closed at: {rejectedStage ? STAGES[rejectionIdx]?.label : "Screening"}
              </h4>
              <p className="text-sm text-destructive/80 mt-1">
                {app.rejection_reason || "Unfortunately you did not move forward in this process."}
              </p>
            </div>
          </div>
        </div>
      )}

      {hired && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-5">
          <div className="flex items-start gap-3">
            <Trophy className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-green-500">🎉 You were selected!</h4>
              <p className="text-sm text-green-500/80 mt-1">
                Check the Offer / BGV section for your offer letter and onboarding documents.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Journey */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h4 className="text-lg font-bold text-foreground mb-5">Hiring Journey</h4>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleSubmissionFile(f); }}
        />
        {STAGES.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            The hiring team hasn’t published the rounds for this role yet.
          </p>
        )}
        <div className="relative">
          <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-border" />
          <div className="space-y-5">

            {STAGES.map((s, idx) => {
              const isRejectionPoint = rejected && rejectionIdx === idx;
              const completed = (!rejected ? idx < currentIdx : idx < rejectionIdx) || (!isRejectionPoint && stageDone(s));
              const current = !rejected && idx === currentIdx;
              return (
                <div key={s.key} className="relative flex items-start gap-4 pl-1">
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                    isRejectionPoint ? "border-destructive bg-destructive/15"
                    : completed ? "border-primary bg-primary/20"
                    : current ? "border-yellow-500 bg-yellow-500/20 animate-pulse"
                    : "border-border bg-card"
                  }`}>
                    {isRejectionPoint ? <XCircle className="h-5 w-5 text-destructive" />
                    : completed ? <CheckCircle2 className="h-5 w-5 text-primary" />
                    : current ? <Clock className="h-5 w-5 text-yellow-500" />
                    : <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className={`text-sm font-semibold ${
                      isRejectionPoint ? "text-destructive"
                      : completed ? "text-primary"
                      : current ? "text-yellow-500"
                      : "text-muted-foreground"
                    }`}>{s.label}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {STAGE_DESC[s.key] || s.config?.instructions || "Round in this hiring process"}
                    </p>

                    {(s.key === "before_interview" || raw === "before_interview" || (current && s.key === "resume")) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          localStorage.setItem("hz_selected_app_id", app.id);
                          window.dispatchEvent(new CustomEvent("hz_switch_candidate_tab", { detail: "before-interview" }));
                          navigate(`/candidate-dashboard?tab=before-interview&appId=${app.id}`);
                        }}
                        className="mt-3 h-8 px-3 text-xs bg-primary text-primary-foreground gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Open Before Interview
                      </Button>
                    )}
                    {current && s.key === "aptitude" && !submittedTest && (
                      <Button size="sm" onClick={() => navigate("/aptitude-test")} className="mt-3 h-8 px-3 text-xs">🎯 Take Aptitude Test</Button>
                    )}
                    {current && s.key === "video_intro" && (
                      <Button size="sm" onClick={() => navigate("/video-intro")} className="mt-3 h-8 px-3 text-xs">🎥 Record Video</Button>
                    )}
                    {current && s.key === "technical" && raw === "technical_test" && (
                      <Button size="sm" onClick={() => navigate("/technical-test")} className="mt-3 h-8 px-3 text-xs">💻 Take Technical Test</Button>
                    )}
                    {current && s.key === "gd" && gdInfo?.id && (
                      <div className="mt-3 text-xs">
                        <p className="text-muted-foreground mb-1.5">📅 {gdInfo.scheduled_date} {gdInfo.scheduled_time}</p>
                        <Button size="sm" onClick={() => navigate(`/gd-room/${gdInfo.id}`)} className="h-8 px-3 text-xs gap-1">
                          <ExternalLink className="h-3 w-3" /> Join GD
                        </Button>
                      </div>
                    )}

                    {/* Custom round set up by the hiring team */}
                    {briefs[s.key] && (
                      <div className="mt-3 space-y-2">
                        {briefs[s.key].instructions && (
                          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2.5 text-xs text-foreground/90">
                            {briefs[s.key].instructions}
                          </p>
                        )}
                        {briefs[s.key].question_format && (
                          <p className="text-[11px] text-muted-foreground">
                            Answer format:{" "}
                            <span className="font-medium text-foreground">
                              {FORMAT_LABEL[briefs[s.key].question_format] || briefs[s.key].question_format}
                            </span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {briefs[s.key].brief_url && (
                            <Button size="sm" variant="outline" className="h-8 gap-1 px-3 text-xs"
                              onClick={() => window.open(briefs[s.key].brief_url, "_blank")}>
                              <FileText className="h-3 w-3" /> View brief
                            </Button>
                          )}
                          {briefs[s.key].link_url && (
                            <Button size="sm" className="h-8 gap-1 px-3 text-xs"
                              onClick={() => window.open(briefs[s.key].link_url, "_blank")}>
                              <ExternalLink className="h-3 w-3" /> Join live
                            </Button>
                          )}
                          {current && (
                            briefs[s.key].submitted_at ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-500">
                                <CheckCircle2 className="h-3 w-3" /> Answer submitted
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={uploading === s.key}
                                className="h-8 gap-1 px-3 text-xs"
                                onClick={() => { pendingStage.current = s.key; fileInputRef.current?.click(); }}
                              >
                                <Upload className="h-3 w-3" /> {uploading === s.key ? "Uploading…" : "Submit answer"}
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                    {!rejected && !current && !completed && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        🔒 Unlocks when HR / hiring manager moves you to this round.
                      </p>
                    )}
                    {/* AI prep is only offered for the round the candidate is currently in */}
                    {!rejected && current && prepKeyFor(s.key) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/interview-prep/${prepKeyFor(s.key)}?application=${app.id}`)}
                        className="mt-2 ml-2 h-8 px-3 text-xs border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                      >
                        🎯 Prep for This Round
                      </Button>
                    )}



                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Resume Analysis details */}
      {app.ai_analysis && typeof app.ai_analysis === "object" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h4 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> AI Resume Analysis
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {Array.isArray(app.ai_analysis.matched_skills) && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Matched Skills</p>
                <div className="flex flex-wrap gap-1">
                  {app.ai_analysis.matched_skills.map((sk: string) => (
                    <span key={sk} className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 text-[11px] font-medium">{sk}</span>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(app.ai_analysis.missing_skills) && app.ai_analysis.missing_skills.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Missing / Weak Skills</p>
                <div className="flex flex-wrap gap-1">
                  {app.ai_analysis.missing_skills.map((sk: string) => (
                    <span key={sk} className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium">{sk}</span>
                  ))}
                </div>
              </div>
            )}
            {app.ai_analysis.recommendation && (
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Recommendation</p>
                <p className="text-foreground/90">{app.ai_analysis.recommendation}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
