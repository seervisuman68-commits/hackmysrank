import { motion } from "framer-motion";
import { Briefcase, ArrowRight } from "lucide-react";
import { normalizePipeline, enabledStages, type PipelineStage } from "@/lib/pipeline";

// Map an application.current_stage string onto a pipeline stage key
const normalizeStageKey = (raw: string): string => {
  if (!raw) return "resume";
  if (["before_interview", "before-interview"].includes(raw)) return "before_interview";
  if (["applied", "ai_scored", "shortlisted", "resume_review"].includes(raw)) return "resume";
  if (["aptitude_test", "test_completed"].includes(raw)) return "aptitude";
  if (["video_intro", "video_submitted"].includes(raw)) return "video_intro";
  if (["technical_round", "technical_test", "technical_completed"].includes(raw)) return "technical";
  if (["group_discussion", "gd_completed", "gd"].includes(raw)) return "gd";
  if (["interview", "hr_interview"].includes(raw)) return "hr_interview";
  if (["managerial"].includes(raw)) return "managerial";
  if (["offer_sent", "offer_letter", "hired", "selected", "bgv", "onboarded", "offer"].includes(raw)) return "offer";
  return raw;
};

interface Props {
  app: {
    id: string;
    current_stage: string;
    status: string;
    applied_at: string;
    jobs?: { title?: string; employment_type?: string | null; work_type?: string | null; location?: string | null; pipeline_stages?: any; companies?: { company_name?: string } | null } | null;
  };
  onOpen: () => void;
}

export default function ApplicationCard({ app, onOpen }: Props) {
  const rawStages = app.jobs?.pipeline_stages;
  const pipeline: PipelineStage[] = Array.isArray(rawStages) && rawStages.length > 0
    ? enabledStages(normalizePipeline(rawStages))
    : [];


  const stageKey = normalizeStageKey(app.current_stage);
  const idx = pipeline.findIndex((s) => s.key === stageKey);
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / pipeline.length) * 100);
  const rejected = app.status === "rejected";
  const currentLabel = idx >= 0 ? pipeline[idx].label : app.current_stage;

  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2 }}
      className="w-full text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h5 className="font-semibold text-foreground truncate">{app.jobs?.title || "—"}</h5>
            <p className="text-xs text-muted-foreground truncate">{app.jobs?.companies?.company_name || "—"}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {app.jobs?.employment_type && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{app.jobs.employment_type}</span>
              )}
              {app.jobs?.work_type && (
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">{app.jobs.work_type}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {((app as any).resume_score != null || (app as any).ai_analysis?.resume_score != null || (app as any).ai_analysis?.score != null) && (
            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              ATS: {(app as any).resume_score ?? (app as any).ai_analysis?.resume_score ?? (app as any).ai_analysis?.score}/100
            </span>
          )}
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
            rejected ? "bg-destructive/10 text-destructive"
            : stageKey === "offer" ? "bg-green-500/15 text-green-500"
            : "bg-primary/10 text-primary"
          }`}>
            {rejected ? "Rejected" : currentLabel}
          </span>
        </div>
      </div>

      {/* Hiring process for this job (from the template HR selected) */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {pipeline.map((s, i) => (
          <span
            key={s.key}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap border ${
              rejected ? "border-border text-muted-foreground"
                : i < idx ? "border-primary/40 bg-primary/10 text-primary"
                : i === idx ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-500"
                : "border-border text-muted-foreground"
            }`}
          >
            {i + 1}. {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          {pipeline.map((s, i) => (
            <div
              key={s.key}
              className={`flex-1 h-1.5 rounded-full ${
                rejected ? "bg-destructive/30"
                : i <= idx ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{rejected ? "Closed" : `${pct}% complete`}</span>
          <span className="flex items-center gap-1">
            Updated {new Date(app.applied_at).toLocaleDateString()}
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}
