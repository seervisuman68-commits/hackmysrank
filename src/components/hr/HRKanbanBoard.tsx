import { useMemo, useState } from "react";
import { Eye, MessageCircle, ArrowRight, X, Search, Filter, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface KanbanApp {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  job_id: string;
  job_title: string;
  current_stage: string;
  status: string;
  resume_score: number | null;
  test_score: number | null;
  technical_score: number | null;
  video_score: number | null;
  photo_url?: string | null;
  applied_at: string;
}

interface Props {
  apps: KanbanApp[];
  onMove: (appId: string, stage: string) => Promise<void> | void;
  onView: (app: KanbanApp) => void;
  onMessage?: (app: KanbanApp) => void;
}

const COLUMNS: { key: string; label: string; color: string; accepts: string[] }[] = [
  { key: "applied", label: "Applied", color: "bg-slate-500", accepts: ["applied"] },
  { key: "ai_scored", label: "Resume Review", color: "bg-blue-500", accepts: ["ai_scored", "shortlisted"] },
  { key: "aptitude_test", label: "Aptitude Test", color: "bg-purple-500", accepts: ["aptitude_test", "test_completed"] },
  { key: "video_intro", label: "Video Introduction", color: "bg-pink-500", accepts: ["video_intro", "video_submitted"] },
  { key: "technical_round", label: "Technical Round", color: "bg-orange-500", accepts: ["technical_round", "technical_test", "technical_completed"] },
  { key: "group_discussion", label: "Group Discussion", color: "bg-cyan-500", accepts: ["group_discussion", "gd_completed"] },
  { key: "hr_interview", label: "Interview", color: "bg-indigo-500", accepts: ["hr_interview", "interview"] },
  { key: "offer_sent", label: "Offer Sent", color: "bg-emerald-500", accepts: ["offer_sent", "selected", "bgv"] },
  { key: "hired", label: "Hired", color: "bg-green-600", accepts: ["hired", "onboarded"] },
  { key: "rejected", label: "Rejected", color: "bg-red-500", accepts: ["rejected"] },
];

const columnOfStage = (stage: string) =>
  COLUMNS.find((c) => c.accepts.includes(stage))?.key ?? "applied";

const scoreColor = (s: number | null) => {
  if (s == null) return "bg-muted text-muted-foreground";
  if (s >= 80) return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (s >= 60) return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
};

export default function HRKanbanBoard({ apps, onMove, onView, onMessage }: Props) {
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ app: KanbanApp; toCol: string } | null>(null);
  const [panelApp, setPanelApp] = useState<KanbanApp | null>(null);
  const [moving, setMoving] = useState(false);

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    apps.forEach((a) => m.set(a.job_id, a.job_title));
    return Array.from(m, ([id, title]) => ({ id, title }));
  }, [apps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return apps.filter((a) => {
      if (q && !(a.candidate_name?.toLowerCase().includes(q) || a.candidate_email?.toLowerCase().includes(q))) return false;
      if (jobFilter !== "all" && a.job_id !== jobFilter) return false;
      const score = a.resume_score ?? (a as any).ai_analysis?.resume_score ?? (a as any).ai_analysis?.score ?? 0;
      if (score < scoreRange[0] || score > scoreRange[1]) return false;
      if (dateFilter !== "all") {
        const days = dateFilter === "7" ? 7 : dateFilter === "30" ? 30 : 90;
        if (now - new Date(a.applied_at).getTime() > days * 86400000) return false;
      }
      return true;
    });
  }, [apps, search, jobFilter, scoreRange, dateFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, KanbanApp[]> = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));
    filtered.forEach((a) => {
      const col = columnOfStage(a.current_stage);
      (g[col] ||= []).push(a);
    });
    return g;
  }, [filtered]);

  const handleDrop = (colKey: string) => {
    setDragOverCol(null);
    if (!dragId) return;
    const app = apps.find((a) => a.id === dragId);
    setDragId(null);
    if (!app) return;
    if (columnOfStage(app.current_stage) === colKey) return;
    setConfirm({ app, toCol: colKey });
  };

  const confirmMove = async () => {
    if (!confirm) return;
    setMoving(true);
    await onMove(confirm.app.id, confirm.toCol);
    setMoving(false);
    setConfirm(null);
  };

  const moveForward = (app: KanbanApp) => {
    const idx = COLUMNS.findIndex((c) => c.key === columnOfStage(app.current_stage));
    if (idx < 0 || idx >= COLUMNS.length - 2) return; // don't auto-advance into rejected
    setConfirm({ app, toCol: COLUMNS[idx + 1].key });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-4 px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Filter by job" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Applied date" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-2 rounded-md border border-border h-9">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">Score {scoreRange[0]}–{scoreRange[1]}</span>
          <Slider
            value={scoreRange}
            onValueChange={(v) => setScoreRange([v[0], v[1]] as [number, number])}
            min={0} max={100} step={5}
            className="flex-1"
          />
        </div>
      </div>

      {/* Board */}
      <div className="pb-4 px-4">
        <div className="flex gap-2 w-full">
          {COLUMNS.map((col) => {
            const items = grouped[col.key] ?? [];
            const isOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={() => handleDrop(col.key)}
                className={`flex-1 min-w-0 basis-0 rounded-xl border bg-muted/30 transition-colors ${
                  isOver ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className={`px-3 py-2.5 rounded-t-xl ${col.color} text-white flex items-center justify-between`}>
                  <span className="text-sm font-semibold truncate">{col.label}</span>
                  <span className="text-xs font-bold bg-white/20 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 max-h-[68vh] overflow-y-auto">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-6">No candidates</p>
                  ) : (
                    items.map((app) => (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={() => setDragId(app.id)}
                        onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                        onClick={() => setPanelApp(app)}
                        className="rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-2">
                          <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden shrink-0">
                            {app.photo_url ? (
                              <img src={app.photo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{app.candidate_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{app.job_title}</p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {(() => {
                            const rScore = app.resume_score ?? (app as any).ai_analysis?.resume_score ?? (app as any).ai_analysis?.score;
                            return (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${scoreColor(rScore)}`}>
                                AI {rScore ?? "—"}
                              </span>
                            );
                          })()}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(app.applied_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => onView(app)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {onMessage && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Message" onClick={() => onMessage(app)}>
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Move forward" onClick={() => moveForward(app)}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm move dialog */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm stage change</DialogTitle>
          </DialogHeader>
          {confirm && (
            <p className="text-sm text-muted-foreground">
              Move <span className="font-semibold text-foreground">{confirm.app.candidate_name}</span> to{" "}
              <span className="font-semibold text-foreground">{COLUMNS.find((c) => c.key === confirm.toCol)?.label}</span>?
              The candidate will be notified.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={moving}>Cancel</Button>
            <Button onClick={confirmMove} disabled={moving}>{moving ? "Moving…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Side panel */}
      <Sheet open={!!panelApp} onOpenChange={(o) => !o && setPanelApp(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          {panelApp && (
            <>
              <SheetHeader>
                <SheetTitle>Candidate Snapshot</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden">
                    {panelApp.photo_url ? (
                      <img src={panelApp.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserIcon className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{panelApp.candidate_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{panelApp.candidate_email}</p>
                    <p className="text-xs text-muted-foreground truncate">{panelApp.job_title}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Resume", v: panelApp.resume_score },
                    { label: "Aptitude", v: panelApp.test_score },
                    { label: "Technical", v: panelApp.technical_score },
                    { label: "Video", v: panelApp.video_score },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                      <p className={`text-lg font-bold ${scoreColor(s.v).split(" ").slice(1).join(" ")}`}>
                        {s.v ?? "—"}{s.v != null && <span className="text-xs">/100</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Stage</p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {panelApp.current_stage.replace(/_/g, " ")}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Applied {new Date(panelApp.applied_at).toLocaleString()}
                  </p>
                </div>

                <div className="space-y-2">
                  <Button className="w-full" onClick={() => { onView(panelApp); setPanelApp(null); }}>
                    <Eye className="h-4 w-4 mr-2" /> View Full Profile
                  </Button>
                  {onMessage && (
                    <Button variant="outline" className="w-full" onClick={() => { onMessage(panelApp); setPanelApp(null); }}>
                      <MessageCircle className="h-4 w-4 mr-2" /> Send Message
                    </Button>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => moveForward(panelApp)}>
                    <ArrowRight className="h-4 w-4 mr-2" /> Move to Next Stage
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => setConfirm({ app: panelApp, toCol: "rejected" })}
                  >
                    <X className="h-4 w-4 mr-2" /> Reject Candidate
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
