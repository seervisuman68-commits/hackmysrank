import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Lock, ExternalLink, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { normalizePipeline, enabledStages, type PipelineStage } from "@/lib/pipeline";

// Map arbitrary application.current_stage strings to a pipeline stage key
const normalizeStageKey = (raw: string): string => {
  if (!raw) return "resume";
  if (String(raw).startsWith("round:")) return String(raw).slice(6);
  if (["before_interview", "before-interview"].includes(raw)) return "resume";
  if (["applied", "ai_scored", "shortlisted", "resume_review"].includes(raw)) return "resume";
  if (["test_completed", "aptitude_test"].includes(raw)) return "aptitude";
  if (["video_submitted", "video_intro"].includes(raw)) return "video_intro";
  if (["technical_test", "technical_completed", "technical_round"].includes(raw)) return "technical";
  if (["group_discussion", "gd_completed", "gd"].includes(raw)) return "gd";
  if (["interview", "hr_interview"].includes(raw)) return "hr_interview";
  if (["managerial"].includes(raw)) return "managerial";
  if (["offer_sent", "hired", "selected", "bgv", "onboarded", "offer_letter", "offer"].includes(raw)) return "offer";
  return raw;
};

interface Props {
  open: boolean;
  onClose: () => void;
  app: any | null;
  gdInfo?: any;
  submittedTest?: boolean;
}

export default function JourneyDrawer({ open, onClose, app, gdInfo, submittedTest }: Props) {
  const navigate = useNavigate();
  if (!app) return null;

  const raw = app.current_stage;
  const currentKey = normalizeStageKey(raw);
  const rejected = app.status === "rejected";

  let rawStages = app.jobs?.pipeline_stages;
  if (typeof rawStages === "string") {
    try {
      rawStages = JSON.parse(rawStages);
    } catch {}
  }
  const pipeline: PipelineStage[] = Array.isArray(rawStages) && rawStages.length > 0
    ? enabledStages(normalizePipeline(rawStages))
    : defaultPipeline();

  const currentIdx = pipeline.findIndex((s) => s.key === currentKey);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{app.jobs?.title || "Application"}</SheetTitle>
          <p className="text-xs text-muted-foreground">{app.jobs?.companies?.company_name}</p>
        </SheetHeader>

        <div className="mt-6 relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-4">
            {pipeline.map((s, idx) => {
              const completed = !rejected && currentIdx >= 0 && idx < currentIdx;
              const current = !rejected && idx === currentIdx;
              const prepKey =
                s.key === "aptitude" ? "aptitude_test" :
                s.key === "video_intro" ? "video_intro" :
                s.key === "technical" ? "technical_round" :
                s.key === "gd" ? "group_discussion" :
                s.key === "hr_interview" ? "hr_interview" :
                s.key === "managerial" ? "hr_interview" :
                null;

              return (
                <div key={s.key} className="relative flex items-start gap-4 pl-2">
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                    completed ? "border-primary bg-primary/20"
                    : current ? "border-yellow-500 bg-yellow-500/20 animate-pulse"
                    : "border-border bg-card"
                  }`}>
                    {completed ? <CheckCircle2 className="h-5 w-5 text-primary" />
                    : current ? <Clock className="h-5 w-5 text-yellow-500" />
                    : <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 pt-1.5">
                    <div className={`text-sm font-medium ${
                      completed ? "text-primary" : current ? "text-yellow-500" : "text-muted-foreground"
                    }`}>{s.label}</div>

                    {s.config?.instructions && current && (
                      <p className="text-xs text-muted-foreground mt-1">{s.config.instructions}</p>
                    )}

                    {current && (s.key === "before_interview" || raw === "before_interview" || s.key === "resume") && (
                      <Button
                        size="sm"
                        onClick={() => {
                          onClose();
                          localStorage.setItem("hz_selected_app_id", app.id);
                          window.dispatchEvent(new CustomEvent("hz_switch_candidate_tab", { detail: "before-interview" }));
                          navigate(`/candidate-dashboard?tab=before-interview&appId=${app.id}`);
                        }}
                        className="mt-2 h-7 px-3 text-xs bg-primary text-primary-foreground gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Open Before Interview
                      </Button>
                    )}
                    {current && s.key === "aptitude" && !submittedTest && (
                      <Button size="sm" onClick={() => navigate("/aptitude-test")} className="mt-2 h-7 px-3 text-xs">🎯 Take Test</Button>
                    )}
                    {current && s.key === "video_intro" && (
                      <Button size="sm" onClick={() => navigate("/video-intro")} className="mt-2 h-7 px-3 text-xs">🎥 Record Video</Button>
                    )}
                    {current && s.key === "technical" && raw === "technical_test" && (
                      <Button size="sm" onClick={() => navigate("/technical-test")} className="mt-2 h-7 px-3 text-xs">💻 Take Technical Test</Button>
                    )}
                    {current && s.key === "gd" && gdInfo?.id && (
                      <div className="mt-2 text-xs">
                        <p className="text-muted-foreground mb-1">📅 {gdInfo.scheduled_date} {gdInfo.scheduled_time}</p>
                        <Button size="sm" onClick={() => navigate(`/gd-room/${gdInfo.id}`)} className="h-7 px-3 text-xs gap-1">
                          <ExternalLink className="h-3 w-3" /> Join GD
                        </Button>
                      </div>
                    )}
                    {current && (s.type === "assignment") && (
                      <p className="mt-2 text-xs text-muted-foreground italic">Assignment details will be shared by HR.</p>
                    )}

                    {!rejected && !current && !completed && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        🔒 Unlocks when HR / hiring manager moves you to this round.
                      </p>
                    )}

                    {/* AI prep only for the round the candidate is currently in */}
                    {!rejected && current && prepKey && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/interview-prep/${prepKey}?application=${app.id}`)}
                        className="mt-2 ml-0 h-7 px-3 text-xs border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 gap-1"
                      >
                        <Sparkles className="h-3 w-3" /> AI Prep for {s.label}
                      </Button>
                    )}


                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {rejected && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            This application has been closed.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
