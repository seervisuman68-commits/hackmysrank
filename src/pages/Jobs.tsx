import { JOB_COLUMNS } from "@/lib/jobColumns";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatLpaRange, toLpa } from "@/lib/salary";
import { supabase } from "@/integrations/supabase/client";
import {
  Zap, Search, MapPin, Briefcase, Clock, Users, Bookmark, BookmarkCheck,
  Sparkles, X, CheckCircle2, ArrowRight, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ApplicationPanel from "@/components/ApplicationPanel";
import { signCompanyAsset } from "@/lib/companyAssets";

interface Job {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  work_type: string | null;
  employment_type?: string | null;
  salary_min: number | null;
  salary_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
  skills_required: string[] | null;
  job_description: string | null;
  created_at: string;
  company_id: string;
  applications_count: number | null;
  companies?: { company_name: string; slug?: string | null; logo_url?: string | null } | null;
}

const WORK_TYPES = ["All", "Onsite", "Remote", "Hybrid"];
const EXP_BUCKETS = [
  { label: "Fresher", min: 0, max: 0 },
  { label: "0-1", min: 0, max: 1 },
  { label: "1-3", min: 1, max: 3 },
  { label: "3-5", min: 3, max: 5 },
  { label: "5+", min: 5, max: 99 },
];
const SALARY_BUCKETS = [
  { label: "Any", min: 0, max: 9999 },
  { label: "3-6 LPA", min: 3, max: 6 },
  { label: "6-10 LPA", min: 6, max: 10 },
  { label: "10-20 LPA", min: 10, max: 20 },
  { label: "20+", min: 20, max: 9999 },
];

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

const CompanyAvatar = ({ logoPath, name, className = "h-10 w-10 rounded-lg" }: { logoPath?: string | null; name?: string | null; className?: string }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    signCompanyAsset(logoPath).then((signed) => { if (active) setUrl(signed); });
    return () => { active = false; };
  }, [logoPath]);

  return (
    <div className={`${className} bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
      {url ? <img src={url} alt={name || "Company"} className="h-full w-full object-cover" /> : (name ? name.charAt(0).toUpperCase() : <Building2 className="h-4 w-4" />)}
    </div>
  );
};

const Jobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [candidateSkills, setCandidateSkills] = useState<string[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [profileIncompleteOpen, setProfileIncompleteOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [workType, setWorkType] = useState("All");
  const [expBucket, setExpBucket] = useState<string | null>(null);
  const [salaryBucket, setSalaryBucket] = useState("Any");
  const [skillFilter, setSkillFilter] = useState<Set<string>>(new Set());

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select(`${JOB_COLUMNS}, companies(company_name, slug, logo_url)`)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    const rows = (data as any[]) || [];
    setJobs(rows);
    setLoading(false);

    // Hydrate live applicant counts (jobs.applications_count is often stale).
    if (rows.length) {
      try {
        const { data: apps } = await supabase
          .from("applications")
          .select("job_id")
          .in("job_id", rows.map((r) => r.id));
        const counts = new Map<string, number>();
        (apps || []).forEach((a: any) => counts.set(a.job_id, (counts.get(a.job_id) || 0) + 1));
        setJobs((prev) => prev.map((j) => ({ ...j, applications_count: counts.get(j.id) ?? j.applications_count ?? 0 })));
      } catch (e) { /* non-blocking */ }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      await loadJobs();
    })();

    try {
      const saved = JSON.parse(localStorage.getItem("hz_saved_jobs") || "[]");
      setSavedJobIds(new Set(saved));
    } catch {}

    // Realtime: new/updated/deleted jobs appear instantly
    const channel = supabase
      .channel("public-jobs-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        loadJobs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadJobs]);

  const [candidateYears, setCandidateYears] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const [{ data: prof }, { data: userRow }] = await Promise.all([
        supabase.from("candidate_profiles").select("skills").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("users").select("id, department").eq("user_id", session.user.id).maybeSingle(),
      ]);
      const candidateIds = [userRow?.id, session.user.id].filter(Boolean);
      const { data: apps } = await supabase
        .from("applications")
        .select("job_id")
        .in("candidate_id", candidateIds);

      const skills = (prof?.skills as any[] | null)?.map((s: any) => typeof s === "string" ? s : s?.name).filter(Boolean) || [];
      setCandidateSkills(skills);
      setAppliedJobIds(new Set((apps || []).map((a: any) => a.job_id)));
      try {
        const exp = JSON.parse((userRow as any)?.department || "{}");
        setCandidateYears(typeof exp.years === "number" ? exp.years : 0);
      } catch { setCandidateYears(0); }
    })();
  }, [session]);

  const allLocations = useMemo(
    () => Array.from(new Set(jobs.map(j => j.location).filter(Boolean))) as string[],
    [jobs]
  );
  const allSkills = useMemo(
    () => Array.from(new Set(jobs.flatMap(j => j.skills_required || []))).slice(0, 30),
    [jobs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const expB = EXP_BUCKETS.find(b => b.label === expBucket);
    const salB = SALARY_BUCKETS.find(b => b.label === salaryBucket)!;
    return jobs.filter(j => {
      // Auto experience-match for logged-in candidates: only show jobs that fit their years
      if (candidateYears !== null) {
        const jmin = j.experience_min ?? 0;
        const jmax = j.experience_max ?? 99;
        if (candidateYears < jmin || candidateYears > jmax) return false;
      }
      if (q) {
        const hay = `${j.title} ${j.companies?.company_name || ""} ${(j.skills_required || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (locationFilter && j.location !== locationFilter) return false;
      if (workType !== "All" && (j.work_type || "").toLowerCase() !== workType.toLowerCase()) return false;
      if (expB) {
        const min = j.experience_min ?? 0;
        if (expBucket === "Fresher") { if (min > 1) return false; }
        else if (min > expB.max || (j.experience_max ?? 99) < expB.min) return false;
      }
      if (salaryBucket !== "Any") {
        const smin = toLpa(j.salary_min);
        const smax = toLpa(j.salary_max);
        if (smax < salB.min || smin > salB.max) return false;
      }
      if (skillFilter.size > 0) {
        const js = new Set((j.skills_required || []).map(s => s.toLowerCase()));
        const ok = Array.from(skillFilter).some(s => js.has(s.toLowerCase()));
        if (!ok) return false;
      }
      return true;
    });
  }, [jobs, search, locationFilter, workType, expBucket, salaryBucket, skillFilter, candidateYears]);

  const recommended = useMemo(() => {
    if (!session?.user || candidateSkills.length === 0) return [];
    return [...jobs]
      .filter(j => {
        if (candidateYears === null) return true;
        const jmin = j.experience_min ?? 0;
        const jmax = j.experience_max ?? 99;
        return candidateYears >= jmin && candidateYears <= jmax;
      })
      .map(j => ({ j, score: matchScore(j.skills_required, candidateSkills) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [jobs, candidateSkills, session, candidateYears]);

  const clearFilters = () => {
    setSearch(""); setLocationFilter(""); setWorkType("All");
    setExpBucket(null); setSalaryBucket("Any"); setSkillFilter(new Set());
  };

  const toggleSave = (id: string) => {
    setSavedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("hz_saved_jobs", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleApply = useCallback(async (job: Job) => {
    if (!session?.user) {
      setSelectedJob(job);
      setLoginModalOpen(true);
      return;
    }
    const { data: prof } = await supabase
      .from("candidate_profiles")
      .select("profile_completed,completion_percentage")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!prof?.profile_completed && (prof?.completion_percentage ?? 0) < 60) {
      setSelectedJob(job);
      setProfileIncompleteOpen(true);
      return;
    }
    setSelectedJob(job);
    setPanelOpen(true);
  }, [session]);

  const activeFilters =
    (search ? 1 : 0) + (locationFilter ? 1 : 0) + (workType !== "All" ? 1 : 0) +
    (expBucket ? 1 : 0) + (salaryBucket !== "Any" ? 1 : 0) + skillFilter.size;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo markClassName="h-8 w-8" textClassName="text-xl" />
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <Button variant="outline" size="sm" onClick={() => navigate("/candidate-dashboard")}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Sign in</Button>
                <Button size="sm" onClick={() => navigate("/candidate-signup")}>Sign up</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero search */}
      <section className="border-b border-border bg-gradient-to-b from-card/40 to-background">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="text-center mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Find your next role</h1>
            <p className="text-muted-foreground mt-2">{jobs.length} open positions across companies</p>
          </div>

          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs, skills, companies"
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Filter row */}
          <div className="max-w-5xl mx-auto mt-6 flex flex-wrap items-center gap-3 justify-center">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-2 rounded-full border border-border bg-card text-sm text-foreground"
            >
              <option value="">All locations</option>
              {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            <div className="flex gap-1 rounded-full border border-border bg-card p-1">
              {WORK_TYPES.map(w => (
                <button key={w} onClick={() => setWorkType(w)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    workType === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>{w}</button>
              ))}
            </div>

            <div className="flex gap-1 rounded-full border border-border bg-card p-1">
              {EXP_BUCKETS.map(b => (
                <button key={b.label} onClick={() => setExpBucket(expBucket === b.label ? null : b.label)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    expBucket === b.label ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>{b.label}</button>
              ))}
            </div>

            <div className="flex gap-1 rounded-full border border-border bg-card p-1">
              {SALARY_BUCKETS.map(b => (
                <button key={b.label} onClick={() => setSalaryBucket(b.label)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    salaryBucket === b.label ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>{b.label}</button>
              ))}
            </div>

            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-xs text-primary underline-offset-4 hover:underline">
                Clear all filters
              </button>
            )}
          </div>

          {/* Skill chips */}
          {allSkills.length > 0 && (
            <div className="max-w-5xl mx-auto mt-4 flex flex-wrap gap-2 justify-center">
              {allSkills.map(s => {
                const active = skillFilter.has(s);
                return (
                  <button key={s}
                    onClick={() => setSkillFilter(prev => {
                      const next = new Set(prev);
                      if (next.has(s)) next.delete(s); else next.add(s);
                      return next;
                    })}
                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                      active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {s}{active && <X className="inline ml-1 h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Recommendations */}
      {session && recommended.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pt-8">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Recommended for You</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-2 px-2">
            {recommended.map(({ j, score }) => (
              <div key={j.id} className="min-w-[300px] max-w-[320px] rounded-2xl border border-primary/30 bg-card p-5 shrink-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{j.companies?.company_name}</p>
                    <h3 className="font-bold text-foreground line-clamp-1">{j.title}</h3>
                  </div>
                  <MatchBadge score={score} />
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Matches {Math.round((score / 100) * (j.skills_required?.length || 0))} of {j.skills_required?.length || 0} required skills
                </p>
                <Button size="sm" className="w-full" onClick={() => navigate(`/jobs/${j.id}`)}>View role</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Job grid */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-sm text-muted-foreground mb-4">{filtered.length} jobs</p>
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading jobs…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No jobs match your filters. <button onClick={clearFilters} className="text-primary underline">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {filtered.map(j => {
                const jobSkills = j.skills_required || [];
                const cset = new Set(candidateSkills.map(s => s.toLowerCase().trim()));
                const matchedSkills = jobSkills.filter(s => cset.has(s.toLowerCase().trim()));
                const extraSkills = candidateSkills.filter(s => !new Set(jobSkills.map(x => x.toLowerCase().trim())).has(s.toLowerCase().trim()));
                const score = session && jobSkills.length ? Math.round((matchedSkills.length / jobSkills.length) * 100) : null;
                const applied = appliedJobIds.has(j.id);
                const saved = savedJobIds.has(j.id);
                const hasSalary = (j.salary_min ?? 0) > 0 || (j.salary_max ?? 0) > 0;
                const hasExp = j.experience_min !== null || j.experience_max !== null;
                return (
                  <motion.div key={j.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="group relative rounded-2xl border border-border bg-card p-5 hover:border-primary/50 transition cursor-pointer"
                    onClick={() => navigate(`/jobs/${j.id}`)}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CompanyAvatar logoPath={j.companies?.logo_url} name={j.companies?.company_name} />
                        <div className="min-w-0">
                          {j.company_id ? (
                            <Link to={`/company/${j.companies?.slug || j.company_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-muted-foreground truncate hover:text-primary hover:underline block">
                              {j.companies?.company_name || "Company"}
                            </Link>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">{j.companies?.company_name || "Company"}</p>
                          )}
                          <h3 className="text-base font-bold text-foreground line-clamp-1">{j.title}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {score !== null && <MatchBadge score={score} />}
                        <button onClick={(e) => { e.stopPropagation(); toggleSave(j.id); }}
                          className="text-muted-foreground hover:text-primary p-1">
                          {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                      {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location}</span>}
                      {j.work_type && <span className="px-2 py-0.5 rounded-full bg-muted">{j.work_type}</span>}
                      {j.employment_type && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{j.employment_type}</span>}
                      <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />
                        {hasExp ? `${j.experience_min ?? 0}-${j.experience_max ?? "+"} yrs` : "Any experience"}
                      </span>
                    </div>

                    {/* Salary */}
                    <p className={`text-sm font-semibold mb-3 ${hasSalary ? "text-green-500" : "text-muted-foreground"}`}>
                      {hasSalary
                        ? formatLpaRange(j.salary_min, j.salary_max)
                        : "Salary not disclosed"}
                    </p>

                    {/* Skill match summary — only for logged-in candidates with skills */}
                    {session && candidateSkills.length > 0 && jobSkills.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {matchedSkills.length}/{jobSkills.length} skills matched
                        </span>
                        {matchedSkills.slice(0, 4).map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">✓ {s}</span>
                        ))}
                        {extraSkills.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground" title={extraSkills.join(", ")}>
                            +{extraSkills.length} bonus skill{extraSkills.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Skills */}
                    {jobSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {jobSkills.slice(0, 3).map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-muted text-foreground">{s}</span>
                        ))}
                        {jobSkills.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{jobSkills.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{daysAgo(j.created_at)}</span>
                        <span className="inline-flex items-center gap-1" title="Applicants">
                          <Users className="h-3 w-3" />{j.applications_count || 0} applied
                        </span>
                      </div>
                      {applied ? (
                        <span className="text-xs font-semibold text-green-500 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Applied
                        </span>
                      ) : (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8"
                          onClick={(e) => { e.stopPropagation(); handleApply(j); }}>
                          Apply Now <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Apply Panel */}
      <ApplicationPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        job={selectedJob ? { id: selectedJob.id, title: selectedJob.title, company_id: selectedJob.company_id } : null}
        onSuccess={() => {
          if (selectedJob) setAppliedJobIds(prev => new Set(prev).add(selectedJob.id));
        }}
      />

      {/* Login modal */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login to Apply</DialogTitle>
            <DialogDescription>Sign in or create an account to apply for this role. You'll be brought back here after.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => {
              if (selectedJob) sessionStorage.setItem("hz_return_to", `/jobs/${selectedJob.id}`);
              navigate("/login");
            }}>Sign in</Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/candidate-signup")}>Create account</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile incomplete modal */}
      <Dialog open={profileIncompleteOpen} onOpenChange={setProfileIncompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete your profile first</DialogTitle>
            <DialogDescription>
              Complete your profile to get a better match score and stand out to recruiters.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => navigate("/complete-profile")}>Complete Profile</Button>
            <Button variant="outline" className="flex-1" onClick={() => {
              setProfileIncompleteOpen(false);
              setPanelOpen(true);
            }}>Apply anyway</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MatchBadge = ({ score }: { score: number }) => {
  const color = score >= 80 ? "text-green-500 border-green-500/40 bg-green-500/10"
    : score >= 50 ? "text-yellow-500 border-yellow-500/40 bg-yellow-500/10"
    : "text-red-500 border-red-500/40 bg-red-500/10";
  return (
    <div className={`h-10 w-10 rounded-full border flex items-center justify-center text-xs font-bold ${color}`}>
      {score}%
    </div>
  );
};

export default Jobs;
