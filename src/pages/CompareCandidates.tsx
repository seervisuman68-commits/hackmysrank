import { JOB_COLUMNS } from "@/lib/jobColumns";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoImg } from "@/components/PhotoImg";
import { ArrowLeft, Star, CheckCircle2, XCircle, PauseCircle, Sparkles, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader2 } from "@/components/BrandLoader";

interface AppRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  current_stage: string;
  applied_at: string;
  photo_url: string | null;
  resume_score: number | null;
  test_score: number | null;
  video_score: number | null;
  technical_score: number | null;
  interview_score: number | null;
  overall_score: number | null;
  experience_years: number | null;
  current_company: string | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  notice_period: number | null;
  ai_analysis: any;
  video_analysis: any;
  candidate_name?: string;
  candidate_email?: string;
}

const scoreColor = (s: number | null | undefined) => {
  if (s == null) return "#6b7280";
  if (s >= 75) return "#16a34a";
  if (s >= 50) return "#eab308";
  return "#ef4444";
};

const verdictBadge = (s: number | null | undefined) => {
  if (s == null) return { label: "N/A", color: "#6b7280" };
  if (s >= 85) return { label: "Strong Hire", color: "#16a34a" };
  if (s >= 70) return { label: "Hire", color: "#22c55e" };
  if (s >= 50) return { label: "Maybe", color: "#eab308" };
  return { label: "No", color: "#ef4444" };
};

function ScoreGauge({ score }: { score: number | null | undefined }) {
  const s = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (s / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="28" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
        <circle
          cx="36"
          cy="36"
          r="28"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="absolute font-bold text-lg" style={{ color }}>
        {score == null ? "–" : s}
      </span>
    </div>
  );
}

function BarFill({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full h-2 rounded bg-muted overflow-hidden">
      <div className="h-full" style={{ width: `${pct}%`, background: scoreColor(value) }} />
    </div>
  );
}

function CompareCandidatesInner() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const ids = useMemo(() => (params.get("ids") || "").split(",").filter(Boolean).slice(0, 3), [params]);
  const jobId = params.get("jobId") || "";

  const [apps, setApps] = useState<AppRow[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<{ recommended?: string; reason?: string; rank_order?: string[]; proceed_with?: string[] } | null>(null);
  const [violationsByApp, setViolationsByApp] = useState<Record<string, number>>({});

  const fetchData = async () => {
    setLoading(true);
    const { data: appsData } = await supabase.from("applications").select("*").in("id", ids);
    if (!appsData || appsData.length === 0) {
      setApps([]);
      setLoading(false);
      return;
    }
    const candIds = [...new Set(appsData.map((a) => a.candidate_id))];
    const { data: users } = await supabase.from("users").select("id, full_name, email").in("id", candIds);
    const uMap = Object.fromEntries((users || []).map((u) => [u.id, u]));

    const { data: jobData } = await supabase.from("jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle();
    setJob(jobData);
    setJobTitle(jobData?.title || "");

    const { data: viol } = await supabase.from("test_violations").select("application_id").in("application_id", ids);
    const vMap: Record<string, number> = {};
    (viol || []).forEach((v: any) => {
      vMap[v.application_id] = (vMap[v.application_id] || 0) + 1;
    });
    setViolationsByApp(vMap);

    const enriched = appsData.map((a: any) => ({
      ...a,
      candidate_name: uMap[a.candidate_id]?.full_name || "Unknown",
      candidate_email: uMap[a.candidate_id]?.email || "",
    })) as AppRow[];
    // preserve ids order
    enriched.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    setApps(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (ids.length >= 2) fetchData();
    else setLoading(false);
  }, [params]);

  const winnerId = useMemo(() => {
    let best: AppRow | null = null;
    for (const a of apps) {
      const s = a.overall_score ?? 0;
      if (!best || (s > (best.overall_score ?? 0))) best = a;
    }
    return best?.id || null;
  }, [apps]);

  const matchedSkills = (a: AppRow): string[] => {
    const skills = a.ai_analysis?.matched_skills || a.ai_analysis?.skills_matched || [];
    return Array.isArray(skills) ? skills.slice(0, 8) : [];
  };
  const missingSkills = (a: AppRow): string[] => {
    const skills = a.ai_analysis?.missing_skills || a.ai_analysis?.skills_missing || [];
    return Array.isArray(skills) ? skills.slice(0, 8) : [];
  };

  const runAI = async () => {
    setAiLoading(true);
    setAi(null);
    try {
      const payload = {
        job: { title: jobTitle, skills: job?.skills_required, description: job?.description },
        candidates: apps.map((a) => ({
          name: a.candidate_name,
          overall: a.overall_score,
          resume_score: a.resume_score ?? a.ai_analysis?.resume_score,
          aptitude_score: a.test_score,
          video_score: a.video_score,
          technical_score: a.technical_score,
          gd_score: a.interview_score,
          experience: a.experience_years,
          current_ctc: a.current_ctc,
          expected_ctc: a.expected_ctc,
          notice_period: a.notice_period,
          matched_skills: matchedSkills(a),
          missing_skills: missingSkills(a),
          violations: violationsByApp[a.id] || 0,
        })),
      };
      const { data, error } = await supabase.functions.invoke("compare-candidates", { body: payload });
      if (error) throw error;
      setAi(data);
    } catch (e: any) {
      toast({ title: "AI Error", description: e?.message || "Failed", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (apps.length >= 2 && !ai && !aiLoading) runAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps.length]);

  const updateStage = async (appId: string, stage: string, status?: string) => {
    const payload: any = { current_stage: stage };
    if (status) payload.status = status;
    const { error } = await supabase.from("applications").update(payload).eq("id", appId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated", description: `Candidate moved to ${stage}` });
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (apps.length < 2) {
    return (
      <div className="min-h-screen p-8">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="mt-8 text-center text-muted-foreground">
          Select 2 or 3 candidates from the candidate list to compare.
        </p>
      </div>
    );
  }

  const labelCellCls = "sticky left-0 bg-card font-medium text-sm text-foreground p-4 align-top border-r border-border min-w-[180px]";
  const dataCellCls = "p-4 align-top border-r border-border min-w-[260px]";

  const rows: { label: string; render: (a: AppRow) => JSX.Element }[] = [
    {
      label: "Candidate",
      render: (a) => (
        <div className="flex items-center gap-3">
          {a.photo_url ? (
            <PhotoImg path={a.photo_url} alt="" className="h-16 w-16 rounded-full object-cover border" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center font-bold text-lg">
              {a.candidate_name?.charAt(0) || "?"}
            </div>
          )}
          <div>
            <div className="font-bold">{a.candidate_name}</div>
            <div className="text-xs text-muted-foreground">
              Applied {new Date(a.applied_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "Overall Score",
      render: (a) => (
        <div className="flex flex-col items-start gap-2">
          <ScoreGauge score={a.overall_score} />
          <div className="text-xs text-muted-foreground">Stage: {a.current_stage}</div>
        </div>
      ),
    },
    {
      label: "Resume Score",
      render: (a) => {
        const rScore = a.resume_score ?? a.ai_analysis?.resume_score;
        return (
          <div className="space-y-2">
            <div className="font-bold text-lg" style={{ color: scoreColor(rScore) }}>
              {rScore ?? "–"}/100
            </div>
            <BarFill value={rScore} />
            <div className="text-xs text-muted-foreground">
              Matched: {matchedSkills(a).length} · Missing: {missingSkills(a).length}
            </div>
          </div>
        );
      },
    },
    {
      label: "Aptitude Test",
      render: (a) => {
        const pass = (a.test_score ?? 0) >= 50;
        return (
          <div className="space-y-1">
            <div className="font-bold text-lg" style={{ color: scoreColor(a.test_score) }}>
              {a.test_score ?? "–"}%
            </div>
            <Badge style={{ background: pass ? "#16a34a" : "#ef4444", color: "white" }}>
              {a.test_score == null ? "Not taken" : pass ? "Pass" : "Fail"}
            </Badge>
            <div className="text-xs text-muted-foreground">Violations: {violationsByApp[a.id] || 0}</div>
          </div>
        );
      },
    },
    {
      label: "Video Score",
      render: (a) => {
        const v = a.video_analysis || {};
        return (
          <div className="space-y-1">
            <div className="font-bold text-lg" style={{ color: scoreColor(a.video_score) }}>
              {a.video_score ?? "–"}/100
            </div>
            <div className="flex flex-wrap gap-1">
              {v.confidence && <Badge variant="outline">Conf: {v.confidence}</Badge>}
              {v.english_level && <Badge variant="outline">English: {v.english_level}</Badge>}
              {v.eye_contact && <Badge variant="outline">Eye: {v.eye_contact}</Badge>}
            </div>
          </div>
        );
      },
    },
    {
      label: "Technical Score",
      render: (a) => {
        const t = a.ai_analysis?.technical || {};
        return (
          <div className="space-y-1">
            <div className="font-bold text-lg" style={{ color: scoreColor(a.technical_score) }}>
              {a.technical_score ?? "–"}/100
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>DSA: {t.dsa_score ?? "–"}</div>
              <div>Coding: {t.coding_score ?? "–"}</div>
              <div>MCQ: {t.mcq_score ?? "–"}</div>
            </div>
          </div>
        );
      },
    },
    {
      label: "GD Score",
      render: (a) => {
        const g = a.ai_analysis?.gd || {};
        return (
          <div className="space-y-1">
            <div className="font-bold text-lg" style={{ color: scoreColor(a.interview_score) }}>
              {a.interview_score ?? "–"}/100
            </div>
            <div className="text-xs text-muted-foreground">
              Speaking: {g.speaking_time ?? "–"}% · Leadership: {g.leadership ?? "–"}
            </div>
          </div>
        );
      },
    },
    {
      label: "Experience & CTC",
      render: (a) => (
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Exp:</span> {a.experience_years ?? 0} yrs</div>
          <div><span className="text-muted-foreground">Company:</span> {a.current_company || "–"}</div>
          <div><span className="text-muted-foreground">Current CTC:</span> ₹{a.current_ctc ?? "–"}</div>
          <div><span className="text-muted-foreground">Expected:</span> ₹{a.expected_ctc ?? "–"}</div>
        </div>
      ),
    },
    {
      label: "Notice Period",
      render: (a) => <div className="font-medium">{a.notice_period ?? "–"} days</div>,
    },
    {
      label: "Skills Match",
      render: (a) => {
        const m = matchedSkills(a);
        const ms = missingSkills(a);
        const total = m.length + ms.length;
        const pct = total ? Math.round((m.length / total) * 100) : 0;
        return (
          <div className="space-y-2">
            <div className="font-bold">{pct}% match</div>
            <div className="flex flex-wrap gap-1">
              {m.map((s, i) => (
                <Badge key={`m${i}`} style={{ background: "#dcfce7", color: "#166534" }}>{s}</Badge>
              ))}
              {ms.map((s, i) => (
                <Badge key={`x${i}`} style={{ background: "#fee2e2", color: "#991b1b" }}>{s}</Badge>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      label: "Integrity Flags",
      render: (a) => {
        const n = violationsByApp[a.id] || 0;
        return (
          <div className="space-y-1">
            <Badge style={{ background: n > 3 ? "#ef4444" : n > 0 ? "#eab308" : "#16a34a", color: "white" }}>
              {n} violations
            </Badge>
          </div>
        );
      },
    },
    {
      label: "AI Verdict",
      render: (a) => {
        const v = verdictBadge(a.overall_score);
        return (
          <div className="space-y-2">
            <Badge style={{ background: v.color, color: "white" }}>{v.label}</Badge>
            <div className="text-xs text-muted-foreground line-clamp-3">
              {a.ai_analysis?.summary || a.ai_analysis?.recommendation || "No AI summary."}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2 -ml-3">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to candidates
            </Button>
            <h1 className="text-3xl font-bold">Candidate Comparison</h1>
            <p className="text-muted-foreground">
              Comparing {apps.length} candidates{jobTitle ? ` for ${jobTitle}` : ""}
            </p>
          </div>
        </div>

        {/* Comparison table */}
        <Card className="overflow-auto mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-muted/50 z-10 border-b border-r border-border" />
                {apps.map((a) => (
                  <th
                    key={a.id}
                    className="border-b border-r border-border p-3 text-left relative"
                    style={
                      a.id === winnerId
                        ? { borderTop: "3px solid #16a34a", borderLeft: "2px solid #16a34a", borderRight: "2px solid #16a34a", background: "rgba(22,163,74,0.04)" }
                        : undefined
                    }
                  >
                    {a.id === winnerId && (
                      <Badge className="absolute -top-2 left-3" style={{ background: "#16a34a", color: "white" }}>
                        <Trophy className="h-3 w-3 mr-1" /> Top Candidate
                      </Badge>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className={labelCellCls}>{row.label}</td>
                  {apps.map((a) => (
                    <td
                      key={a.id}
                      className={dataCellCls}
                      style={a.id === winnerId ? { borderLeft: "2px solid #16a34a", borderRight: "2px solid #16a34a", background: "rgba(22,163,74,0.04)" } : undefined}
                    >
                      {row.render(a)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* AI Recommendation */}
        <Card className="p-6 mb-6 border-2" style={{ borderColor: "#8b5cf6" }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5" style={{ color: "#8b5cf6" }} />
            <h2 className="text-xl font-bold">AI Final Recommendation</h2>
            <Button size="sm" variant="ghost" onClick={runAI} disabled={aiLoading} className="ml-auto">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate"}
            </Button>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing candidates…
            </div>
          )}
          {ai && !aiLoading && (
            <div className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Recommended: </span>
                <span className="text-lg font-bold" style={{ color: "#16a34a" }}>
                  {ai.recommended || "—"}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{ai.reason}</p>
              {Array.isArray(ai.rank_order) && ai.rank_order.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Rank order:</div>
                  <ol className="list-decimal list-inside text-sm space-y-0.5">
                    {ai.rank_order.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ol>
                </div>
              )}
              {Array.isArray(ai.proceed_with) && ai.proceed_with.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ai.proceed_with.map((n, i) => (
                    <Badge key={i} style={{ background: "#16a34a", color: "white" }}>
                      <Star className="h-3 w-3 mr-1" /> Proceed: {n}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Action buttons */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${apps.length}, minmax(0, 1fr))` }}>
            {apps.map((a) => (
              <div key={a.id} className="border rounded-lg p-4 space-y-2">
                <div className="font-medium">{a.candidate_name}</div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={() => updateStage(a.id, "shortlisted")} style={{ background: "#16a34a", color: "white" }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Move Forward
                  </Button>
                  <Button size="sm" onClick={() => updateStage(a.id, "rejected", "rejected")} style={{ background: "#ef4444", color: "white" }}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => updateStage(a.id, "on_hold")} style={{ background: "#eab308", color: "white" }}>
                    <PauseCircle className="h-4 w-4 mr-1" /> On Hold
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function CompareCandidates() {
  return (
    <ProtectedRoute requiredRole={["hr", "manager"]}>
      <CompareCandidatesInner />
    </ProtectedRoute>
  );
}
