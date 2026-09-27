import { JOB_COLUMNS } from "@/lib/jobColumns";
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatLpaRange } from "@/lib/salary";
import { supabase } from "@/integrations/supabase/client";
import { signCompanyAsset } from "@/lib/companyAssets";
import {
  Zap, MapPin, Briefcase, Clock, Users, Bookmark, BookmarkCheck,
  Share2, ArrowLeft, CheckCircle2, FileText, ClipboardList, Video,
  Code2, MessagesSquare, UserCheck, Award
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ApplicationPanel from "@/components/ApplicationPanel";
import { normalizePipeline, enabledStages, defaultPipeline, type PipelineStage } from "@/lib/pipeline";

const STAGE_ICONS: Record<string, any> = {
  screening: FileText,
  test: ClipboardList,
  video: Video,
  technical: Code2,
  gd: MessagesSquare,
  interview: UserCheck,
  assignment: FileText,
  info: FileText,
  offer: Award,
};

const stageMeta = (s: PipelineStage) => {
  const Icon = STAGE_ICONS[s.type] || FileText;
  const cfg = s.config || {};
  let days = "";
  if (cfg.duration) days = `${cfg.duration} min`;
  else if (s.type === "screening") days = "1-2 days";
  else if (s.type === "offer") days = "1-3 days";
  else if (s.type === "assignment") days = "Take-home";
  return { Icon, days };
};

const daysAgo = (date: string) => {
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
};

const matchScore = (jobSkills: string[] | null, candidateSkills: string[]): number => {
  if (!jobSkills?.length || !candidateSkills?.length) return 0;
  const cset = new Set(candidateSkills.map(s => s.toLowerCase().trim()));
  const matches = jobSkills.filter(s => cset.has(s.toLowerCase().trim())).length;
  return Math.round((matches / jobSkills.length) * 100);
};

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [candidateSkills, setCandidateSkills] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const { data } = await supabase
        .from("jobs")
        .select(`${JOB_COLUMNS}, companies(company_name, industry, location, slug, logo_url)`)
        .eq("id", id)
        .maybeSingle();
      setJob(data);
      if ((data as any)?.companies?.logo_url) {
        setCompanyLogo(await signCompanyAsset((data as any).companies.logo_url));
      }
      setLoading(false);

      try {
        const sv = JSON.parse(localStorage.getItem("hz_saved_jobs") || "[]");
        setSaved(sv.includes(id));
      } catch {}

      if (session?.user) {
        const [{ data: prof }, { data: userRow }] = await Promise.all([
          supabase.from("candidate_profiles").select("skills").eq("user_id", session.user.id).maybeSingle(),
          supabase.from("users").select("id").eq("user_id", session.user.id).maybeSingle(),
        ]);
        const candidateIds = [userRow?.id, session.user.id].filter(Boolean);
        const { data: app } = await supabase
          .from("applications")
          .select("id")
          .in("candidate_id", candidateIds)
          .eq("job_id", id)
          .maybeSingle();

        const skills = (prof?.skills as any[] | null)?.map((s: any) => typeof s === "string" ? s : s?.name).filter(Boolean) || [];
        setCandidateSkills(skills);
        setApplied(!!app);
      }
    })();
  }, [id]);

  const score = useMemo(
    () => session ? matchScore(job?.skills_required, candidateSkills) : null,
    [job, candidateSkills, session]
  );

  // Rounds come from the interview-process template HR selected for this job.
  const jobPipeline: PipelineStage[] = useMemo(() => {
    const raw = (job as any)?.pipeline_stages;
    return enabledStages(Array.isArray(raw) && raw.length > 0 ? normalizePipeline(raw) : defaultPipeline());
  }, [job]);



  const toggleSave = () => {
    try {
      const sv: string[] = JSON.parse(localStorage.getItem("hz_saved_jobs") || "[]");
      const next = sv.includes(id!) ? sv.filter(x => x !== id) : [...sv, id!];
      localStorage.setItem("hz_saved_jobs", JSON.stringify(next));
      setSaved(!saved);
    } catch {}
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: job?.title, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); }
    } catch {}
  };

  const handleApply = async () => {
    if (!session?.user) { setLoginOpen(true); return; }
    const { data: prof } = await supabase
      .from("candidate_profiles")
      .select("profile_completed, completion_percentage")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!prof?.profile_completed && (prof?.completion_percentage ?? 0) < 60) {
      setProfileOpen(true);
      return;
    }
    setPanelOpen(true);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!job) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Job not found.</p>
      <Button onClick={() => navigate("/jobs")}>Browse jobs</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo markClassName="h-8 w-8" textClassName="text-xl" />
          </Link>
          <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to jobs
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden">
                {companyLogo ? <img src={companyLogo} alt={job.companies?.company_name || "Company"} className="h-full w-full object-cover" /> : (job.companies?.company_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {job.company_id ? (
                  <Link to={`/company/${job.companies?.slug || job.company_id}`} className="text-sm text-muted-foreground hover:text-primary hover:underline">
                    {job.companies?.company_name}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">{job.companies?.company_name}</p>
                )}
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{job.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
                  {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
                  {job.work_type && <span className="px-2 py-0.5 rounded-full bg-muted text-xs">{job.work_type}</span>}
                  {(job as any).employment_type && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{(job as any).employment_type}</span>}
                  {(job.experience_min !== null || job.experience_max !== null) && (
                    <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{job.experience_min ?? 0}-{job.experience_max ?? "+"} yrs</span>
                  )}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{daysAgo(job.created_at)}</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{job.applications_count || 0} applicants</span>
                </div>
                {(Number(job.salary_min) > 0 || Number(job.salary_max) > 0) ? (
                  <p className="mt-3 text-lg font-semibold text-green-500">
                    {formatLpaRange(job.salary_min, job.salary_max)}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Salary: Not disclosed</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Description */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground mb-3">About the role</h2>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {job.job_description || "No description provided."}
            </div>
          </div>

          {/* Skills */}
          {job.skills_required && job.skills_required.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground mb-3">Skills required</h2>
              <div className="flex flex-wrap gap-2">
                {job.skills_required.map((s: string) => {
                  const matched = candidateSkills.some(cs => cs.toLowerCase() === s.toLowerCase());
                  return (
                    <span key={s} className={`px-3 py-1 rounded-full text-xs border ${
                      matched ? "bg-green-500/10 border-green-500/40 text-green-500" : "bg-muted border-border text-foreground"
                    }`}>
                      {matched && <CheckCircle2 className="inline h-3 w-3 mr-1" />}{s}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pipeline */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground mb-1">Hiring pipeline</h2>
            <p className="text-xs text-muted-foreground mb-5">Here's what the journey looks like</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {jobPipeline.map((s, idx) => {
                const { Icon, days } = stageMeta(s);
                return (
                  <div key={s.key} className="relative rounded-xl border border-border p-3 bg-background/40">
                    <div className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </div>
                    <Icon className="h-5 w-5 text-primary mb-2" />
                    <p className="text-sm font-semibold text-foreground">{s.label}</p>
                    {days && <p className="text-xs text-muted-foreground">{days}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Company */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground mb-1">About {job.companies?.company_name}</h2>
            <p className="text-sm text-muted-foreground">
              {job.companies?.industry || "Industry not specified"} · {job.companies?.location || "Location not specified"}
            </p>
            {job.company_id && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(`/company/${job.companies?.slug || job.company_id}`)}>
                View company profile
              </Button>
            )}
          </div>
        </div>

        {/* Right sticky apply */}
        <div>
          <div className="lg:sticky lg:top-24 rounded-2xl border border-border bg-card p-6 space-y-4">
            {score !== null && (
              <div className="flex items-center gap-3">
                <div className={`h-14 w-14 rounded-full border-2 flex items-center justify-center text-base font-bold ${
                  score >= 80 ? "border-green-500 text-green-500"
                  : score >= 50 ? "border-yellow-500 text-yellow-500"
                  : "border-red-500 text-red-500"
                }`}>{score}%</div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Your match</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((score / 100) * (job.skills_required?.length || 0))} of {job.skills_required?.length || 0} skills
                  </p>
                </div>
              </div>
            )}

            {applied ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-sm font-semibold text-green-500">Already applied</p>
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate("/candidate-dashboard")}>
                  Track in dashboard
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleApply}>
                Apply Now
              </Button>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={toggleSave}>
                {saved ? <BookmarkCheck className="h-4 w-4 mr-1" /> : <Bookmark className="h-4 w-4 mr-1" />}
                {saved ? "Saved" : "Save"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-1" /> Share
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ApplicationPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        job={{ id: job.id, title: job.title, company_id: job.company_id }}
        onSuccess={() => { setApplied(true); setSuccessOpen(true); }}
      />

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login to Apply</DialogTitle>
            <DialogDescription>Sign in or create an account to apply. We'll bring you back here.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => {
              sessionStorage.setItem("hz_return_to", `/jobs/${id}`);
              navigate("/login");
            }}>Sign in</Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/candidate-signup")}>Create account</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete your profile first</DialogTitle>
            <DialogDescription>A complete profile gives you a stronger match score and better recruiter visibility.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => navigate("/complete-profile")}>Complete Profile</Button>
            <Button variant="outline" className="flex-1" onClick={() => { setProfileOpen(false); setPanelOpen(true); }}>
              Apply anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <div className="text-center py-6">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="h-16 w-16 rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </motion.div>
            <h3 className="text-xl font-bold text-foreground">Application submitted!</h3>
            <p className="text-sm text-muted-foreground mt-1">Track your progress from the candidate dashboard.</p>
            <div className="flex gap-2 mt-5 justify-center">
              <Button onClick={() => navigate("/candidate-dashboard")}>Go to dashboard</Button>
              <Button variant="outline" onClick={() => { setSuccessOpen(false); navigate("/jobs"); }}>
                Browse more jobs
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobDetail;
