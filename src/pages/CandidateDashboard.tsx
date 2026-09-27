import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/useLiveData";
import {
  Zap, LayoutDashboard, Briefcase, MessageSquare, Settings,
  User, LogOut, CheckCircle2, Clock, Lock, FileText,
  Upload, Video, ExternalLink, Search, Camera, Key, Sparkles, BarChart3,
  Archive, ChevronRight, XCircle, Trophy, CalendarDays, ScanSearch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import NegotiationChat from "@/components/NegotiationChat";
import ChatSystem from "@/components/ChatSystem";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import ProfileRing from "@/components/candidate/ProfileRing";
import ApplicationCard from "@/components/candidate/ApplicationCard";
import JourneyDrawer from "@/components/candidate/JourneyDrawer";
import ApplicationDetailView from "@/components/candidate/ApplicationDetailView";
import NotificationsBell from "@/components/candidate/NotificationsBell";
import AIAssistant from "@/components/candidate/AIAssistant";
import BeforeInterviewCandidatePanel from "@/components/candidate/BeforeInterviewCandidatePanel";
import ThemeToggle from "@/components/ThemeToggle";
import BrandLogo from "@/components/BrandLogo";
import { Loader2 } from "@/components/BrandLoader";

const stages = [
  { key: "applied", label: "Applied", icon: "✅" },
  { key: "resume_review", label: "Resume Review", icon: "⏳" },
  { key: "aptitude_test", label: "Aptitude Test", icon: "🔒" },
  { key: "video_intro", label: "Video Introduction", icon: "🔒" },
  { key: "technical_round", label: "Technical Round", icon: "🔒" },
  { key: "group_discussion", label: "Group Discussion", icon: "🔒" },
  { key: "hr_interview", label: "HR Interview", icon: "🔒" },
  { key: "offer_letter", label: "Offer Letter", icon: "🔒" },
];

interface Application {
  id: string;
  current_stage: string;
  status: string;
  applied_at: string;
  job_id: string;
  resume_url?: string | null;
  test_score?: number | null;
  jobs?: { title: string; company_id: string; companies?: { company_name: string } | null } | null;
}

const CandidateDashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submittedTestAppIds, setSubmittedTestAppIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [offerLetter, setOfferLetter] = useState<any>(null);
  const [companyName, setCompanyName] = useState("");
  const [interviews, setInterviews] = useState<any[]>([]);
  const [bgvDocs, setBgvDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [negotiationOpen, setNegotiationOpen] = useState(false);
  const [gdInfo, setGdInfo] = useState<any>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [browseJobs, setBrowseJobs] = useState<any[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Onboarding & Experience states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingType, setOnboardingType] = useState<"student" | "fresher" | "experience">("fresher");
  const [onboardingYears, setOnboardingYears] = useState(0);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [experienceType, setExperienceType] = useState<string>("fresher");
  const [experienceYears, setExperienceYears] = useState<number>(0);
  const [profileCompletion, setProfileCompletion] = useState<{ pct: number; missing: string[] } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [journeyApp, setJourneyApp] = useState<Application | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!userData) return;
      setUser(userData);
      setProfileName(userData.full_name);
      setProfilePhone(userData.phone || "");

    // Profile completion
    const { data: prof } = await supabase
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    const stage = (localStorage.getItem(`hz_career_stage_${session.user.id}`) || "") as
      | "student" | "fresher" | "professional" | "";
    const isPro = stage === "professional";
    const missing: string[] = [];
    if (!prof?.photo_url) missing.push("Profile photo");
    if (!prof?.headline) missing.push("Professional headline");
    if (!prof?.about_me || (prof?.about_me?.length || 0) < 50) missing.push("About me");
    if (isPro && !((prof?.experiences as any[])?.length)) missing.push("Work experience");
    if (!((prof?.education as any[])?.length)) missing.push("Education");
    if (!((prof?.skills as any[])?.length)) missing.push("Skills");
    if (isPro && !prof?.expected_ctc) missing.push("Expected CTC");
    if (!((prof?.work_types as any[])?.length)) missing.push("Work type preferences");
    if (!((prof?.projects as any[])?.length)) missing.push("Projects");
    // Recompute % locally so freshers/students aren't penalised for missing pro-only fields
    let recomputed = prof?.completion_percentage ?? 0;
    try {
      const { computeCompletion } = await import("@/pages/CompleteProfile");
      if (prof) recomputed = computeCompletion(prof, stage || null);
    } catch {}
    setProfileCompletion({ pct: recomputed, missing });
    setPhotoUrl(prof?.photo_url || null);

    let parsedExp = { type: "", years: 0 };
    try {
      if (userData.department && userData.department.trim().startsWith("{")) {
        parsedExp = JSON.parse(userData.department);
      }
    } catch (e) {
      console.error("Error parsing experience JSON:", e);
    }

    if (userData.role === "candidate" && (!parsedExp.type || !["student", "fresher", "experience"].includes(parsedExp.type))) {
      setShowOnboarding(true);
    } else {
      setExperienceType(parsedExp.type || "fresher");
      setExperienceYears(parsedExp.years || 0);
    }

    const { data: apps } = await supabase
      .from("applications")
      .select("*, jobs(title, company_id, employment_type, work_type, location, pipeline_stages, companies(company_name))")
      .eq("candidate_id", userData.id)
      .order("applied_at", { ascending: false });

    if (apps) {
      const appRows = apps as unknown as Application[];
      setApplications(appRows);

      const appIds = appRows.map((a) => a.id);
      if (appIds.length > 0) {
        const { data: answerRows } = await supabase
          .from("test_answers")
          .select("application_id")
          .in("application_id", appIds);
        setSubmittedTestAppIds(new Set((answerRows || []).map((r: any) => r.application_id)));
      }
    }

    const { data: offers } = await supabase
      .from("offer_letters")
      .select("*")
      .eq("candidate_id", userData.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (offers?.length) {
      setOfferLetter(offers[0]);
      const { data: comp } = await supabase.from("companies").select("company_name").eq("id", (offers[0] as any).company_id).maybeSingle();
      if (comp) setCompanyName(comp.company_name);
    }

    const { data: interviewData } = await supabase
      .from("interviews")
      .select("*")
      .eq("candidate_id", userData.id)
      .order("scheduled_date", { ascending: false });
    if (interviewData) setInterviews(interviewData as any);

    if (apps?.length) {
      const { data: myGroups } = await supabase
        .from("gd_groups")
        .select("gd_id, group_name, candidate_ids")
        .contains("candidate_ids", [userData.id]);
      const myGroup = (myGroups || [])[0] as any;
      if (myGroup?.gd_id) {
        const { data: gd } = await supabase
          .from("group_discussions")
          .select("id, topic, scheduled_date, scheduled_time, meeting_link, daily_room_url")
          .eq("id", myGroup.gd_id)
          .maybeSingle();
        if (gd) setGdInfo({ ...gd, group_name: myGroup.group_name });
      }
    }

    const { data: bgvData } = await supabase.from("bgv_documents").select("*").eq("candidate_id", userData.id);
    if (bgvData) setBgvDocs(bgvData as any);

    const { data: notifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userData.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (notifs) setNotifications(notifs);

    const { count: unreadCount } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userData.id)
      .eq("is_read", false);
    setUnreadMessages(unreadCount || 0);

    const { data: openJobs } = await supabase
      .from("jobs")
      .select("id, title, department, location, work_type, employment_type, salary_min, salary_max, skills_required, company_id, companies(company_name), experience_min, experience_max")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (openJobs) {
      const candidateYears = parsedExp.years || 0;
      const norm = (s: any) =>
        String(typeof s === "string" ? s : s?.name || s?.skill || "").trim().toLowerCase();
      const mySkills = new Set(
        ((prof?.skills as any[]) || []).map(norm).filter(Boolean)
      );

      // What kind of engagement is this candidate seeking?
      const seekStage = localStorage.getItem(`hz_career_stage_${session.user.id}`);
      const wantedTypes = new Set<string>(
        (((prof?.work_types as any[]) || []).map((t) => String(t).toLowerCase()))
      );
      if (wantedTypes.size === 0) {
        if (seekStage === "student") wantedTypes.add("internship");
        else wantedTypes.add("full-time");
      }


      const scored = (openJobs as any[]).map((job) => {
        const req: string[] = (job.skills_required || []).map(norm).filter(Boolean);
        const matched = req.filter((s) => mySkills.has(s));
        const skillPct = req.length === 0 ? 0 : Math.round((matched.length / req.length) * 100);

        const minExp = job.experience_min ?? 0;
        const maxExp = Math.max(job.experience_max ?? 99, minExp);
        const expFit = candidateYears >= minExp && candidateYears <= maxExp;
        // Skills carry the weight; experience fit is a bonus, never a hard filter
        const matchScore = Math.min(100, Math.round(skillPct * 0.8 + (expFit ? 20 : 0)));

        const jobType = String(job.employment_type || "").toLowerCase();
        // Preferred engagement type floats to the top; others still stay visible
        const typeFit = jobType ? wantedTypes.has(jobType) : false;

        return { ...job, matchedSkills: matched.length, skillPct, expFit, matchScore, typeFit };
      });

      scored.sort((a, b) => (Number(b.typeFit) - Number(a.typeFit)) || (b.matchScore - a.matchScore));
      setBrowseJobs(scored);

      }
    } catch (e) {
      console.error("Error fetching candidate dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOnboardingSubmit = async () => {
    if (!user) return;
    setOnboardingSubmitting(true);
    const expJson = JSON.stringify({
      type: onboardingType,
      years: onboardingType === "experience" ? onboardingYears : 0,
    });

    const { error } = await supabase
      .from("users")
      .update({ department: expJson })
      .eq("id", user.id);

    if (error) {
      toast({
        title: "Error saving profile",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "🎉 Profile Completed!",
        description: "Your experience preferences have been saved.",
      });
      setUser({ ...user, department: expJson });
      setExperienceType(onboardingType);
      setExperienceYears(onboardingType === "experience" ? onboardingYears : 0);
      setShowOnboarding(false);
      fetchData();
    }
    setOnboardingSubmitting(false);
  };

  useEffect(() => {
    fetchData();

    // Check URL parameters for tab navigation
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab")?.toLowerCase();
    if (tabParam === "before_interview" || tabParam === "before-interview" || tabParam === "beforeinterview") {
      setActiveTab("before-interview");
    }

    const handleSwitchTab = (e: any) => {
      if (e.detail) {
        const val = String(e.detail).toLowerCase();
        if (val === "before_interview" || val === "before-interview" || val === "beforeinterview") {
          setActiveTab("before-interview");
        } else {
          setActiveTab(e.detail);
        }
      }
    };
    window.addEventListener("hz_switch_candidate_tab", handleSwitchTab);
    return () => window.removeEventListener("hz_switch_candidate_tab", handleSwitchTab);
  }, [fetchData]);

  // Real-time subscription for application stage changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("candidate-app-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setApplications((prev) =>
            prev.map((a) => a.id === updated.id ? { ...a, ...updated } : a)
          );
          toast({
            title: "📋 Application Updated",
            description: `Your application stage changed to: ${updated.current_stage?.replace(/_/g, " ")}`,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${user.id}`,
        },
        () => { fetchData(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jobs" },
        () => { fetchData(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        () => { fetchData(); }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as any;
          setNotifications((prev) => [newNotif, ...prev]);
            if ("Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(newNotif.title || "HireZap", { body: newNotif.message || "", icon: "/favicon.png" });
              } catch { /* noop */ }
            }
          toast({
            title: `🔔 ${newNotif.title}`,
            description: newNotif.message?.substring(0, 100),
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, toast, fetchData]);

  // Live tracking: any move HR/managers make on this candidate reflects instantly
  useLiveData(
    ["applications", "interviews", "offer_letters", "round_briefs", "assessments", "jobs", "notifications"],
    () => fetchData(),
    { key: `candidate-live-${user?.id || "anon"}`, enabled: !!user?.id },
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const getStageIndex = (stage: string) => stages.findIndex((s) => s.key === stage);

  const viewResume = async (resumeRef: string | null | undefined) => {
    if (!resumeRef) return;
    if (resumeRef.startsWith("http")) {
      window.open(resumeRef, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(resumeRef, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const normalizeMeetingLink = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary" />
      </div>
    );
  }

  // Closed = rejected (by status or stage), removed by the company, or finished (hired/selected/onboarded).
  const isClosedApp = (a: any) =>
    !a ||
    a.status === "rejected" ||
    a.current_stage === "rejected" ||
    a.status === "deleted" ||
    Boolean(a.deleted_at) ||
    ["hired", "selected", "onboarded"].includes(a.current_stage);
  const activeApps = (applications || []).filter((a: any) => a && !isClosedApp(a));
  const historyApps = (applications || []).filter((a: any) => a && isClosedApp(a));

  // Interview bucketing (also drop interviews linked to a closed application).
  const rejectedAppIds = new Set(
    historyApps
      .filter((a: any) => a && (a.status === "rejected" || a.current_stage === "rejected" || a.status === "deleted" || a.deleted_at))
      .map((a: any) => a.id)
  );
  const liveInterviews = (interviews || []).filter((i: any) => i && !rejectedAppIds.has(i.application_id));

  const ongoingInterviews = liveInterviews.filter((i: any) => i && i.started_at && !i.ended_at && i.status !== "completed");
  const overInterviews = liveInterviews.filter((i: any) => i && (i.ended_at || i.status === "completed"));
  const scheduledInterviews = liveInterviews.filter((i: any) => i && !i.started_at && !i.ended_at && i.status !== "completed");

  const sidebarLinks = [
    { icon: LayoutDashboard, label: "Dashboard", key: "dashboard" },
    { icon: Briefcase, label: "My Applications", key: "applications", badge: activeApps.length || undefined },
    { icon: ScanSearch, label: "Before Interview", key: "before-interview" },
    { icon: CalendarDays, label: "Interviews", key: "interviews", badge: ongoingInterviews.length || undefined },
    ...(offerLetter ? [{ icon: FileText, label: "Offer Letter", key: "offer", badge: offerLetter.status === "sent" ? 1 : undefined }] : []),
    { icon: Archive, label: "History", key: "history", badge: historyApps.length || undefined },
    { icon: Search, label: "Browse Jobs", key: "browse" },
    { icon: BarChart3, label: "My Analytics", key: "my-analytics" },
    { icon: FileText, label: "Resume Builder", key: "resume-builder" },
    { icon: User, label: "Profile", key: "profile" },
  ];


  const renderDashboard = () => {
    const latestApp = activeApps[0] || applications[0];
    if (!latestApp) {
      return (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No applications yet</p>
          <Button variant="ghost" onClick={() => setActiveTab("browse")} className="mt-3 text-primary">
            Browse Jobs
          </Button>
        </div>
      );
    }

    const rawStage = latestApp.current_stage;
    const hasSubmittedCurrentTest = submittedTestAppIds.has(latestApp.id);
    const normalizedStage =
      rawStage === "applied" || rawStage === "ai_scored" ? "resume_review"
      : rawStage === "test_completed" ? "aptitude_test"
      : rawStage === "aptitude_test" && hasSubmittedCurrentTest ? "aptitude_test"
      : rawStage === "shortlisted" ? "aptitude_test"
      : rawStage === "video_submitted" ? "technical_round"
      : rawStage === "technical_round" || rawStage === "technical_test" ? "technical_round"
      : rawStage === "technical_completed" ? "group_discussion"
      : rawStage === "gd_completed" ? "hr_interview"
      : rawStage === "interview" || rawStage === "hr_interview" ? "hr_interview"
      : rawStage === "offer_sent" || rawStage === "hired" || rawStage === "selected" || rawStage === "bgv" || rawStage === "onboarded" ? "offer_letter"
      : rawStage;
    const currentIdx = getStageIndex(normalizedStage);

    const aiTips = [
      "Adding 2 more projects can lift your match score by ~23%.",
      "Recruiters spend 6 seconds on a headline — make yours specific.",
      "Listing 6–10 skills more than doubles relevant matches.",
      "A 3-sentence ‘About Me’ outperforms a one-liner by 40%.",
      "Click an application card to see its full journey and next step.",
    ];
    const tip = aiTips[new Date().getDate() % aiTips.length];

    return (
      <div className="space-y-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="text-2xl font-bold text-foreground">
            Welcome back, <span className="text-primary">{user?.full_name?.split(" ")[0]}</span>
          </h3>
          <p className="text-muted-foreground mt-1">Track your application progress and upcoming steps.</p>
        </motion.div>

        {/* Profile Completion Ring + AI Tip */}
        <div className="grid md:grid-cols-3 gap-4">
          {profileCompletion && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="md:col-span-2 rounded-2xl border border-border bg-card p-5 flex items-center gap-5">
              <ProfileRing percentage={profileCompletion.pct} size={110} />
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-foreground">
                  {profileCompletion.pct >= 100 ? "Your profile is complete 🎉" : `Your profile is ${profileCompletion.pct}% complete`}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Complete sections boost your match score.</p>
                {profileCompletion.missing.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profileCompletion.missing.slice(0, 5).map(m => (
                      <button key={m} onClick={() => navigate("/complete-profile")}
                        className="px-2.5 py-1 rounded-full bg-muted hover:bg-secondary text-xs text-foreground transition-colors">
                        + {m}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="sm" onClick={() => navigate("/profile")} variant="outline" className="mt-3 h-7 px-3 text-xs">
                  View full profile
                </Button>
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-green-500" />
              <h4 className="text-sm font-bold text-green-700 dark:text-green-400">AI Tip of the day</h4>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 leading-relaxed">{tip}</p>
          </motion.div>
        </div>

        {/* Active Applications */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-bold text-foreground">Active Applications</h4>
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("browse")} className="text-primary text-xs">Browse more →</Button>
          </div>
          {activeApps.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-border">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No active applications</p>
              <Button variant="ghost" onClick={() => setActiveTab("browse")} className="mt-2 text-primary">Browse Jobs</Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {activeApps.map((a) => (
                <ApplicationCard key={a.id} app={a as any} onOpen={() => setJourneyApp(a)} />
              ))}
            </div>
          )}

        </motion.div>

        {/* Live / In-progress interviews only (Scheduled + Over live in the Interviews tab) */}
        {ongoingInterviews.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <h4 className="text-lg font-bold text-foreground mb-4">🟢 Interview in Progress</h4>
            <div className="space-y-3">
              {ongoingInterviews.map((interview: any) => (
                <div key={interview.id} className="rounded-xl border border-border bg-card p-4">
                  <p className="font-medium text-foreground">{String(interview.round_type || "").replace(/_/g, " ")}</p>
                  <p className="text-sm text-muted-foreground mt-1">With: {interview.interviewer_name}</p>
                  <button
                    onClick={() => navigate(`/interview-room/${interview.id}`)}
                    className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Join Meeting
                  </button>

                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Upcoming and past interviews are in the <button className="underline" onClick={() => setActiveTab("interviews")}>Interviews</button> tab.
            </p>
          </motion.div>
        )}

        {/* Offer Letter */}
        {offerLetter && renderOfferSection()}
      </div>
    );
  };


  const renderOfferSection = () => {
    if (!offerLetter) return null;
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-6">
        <h4 className="text-lg font-bold text-foreground mb-2">🎉 Congratulations!</h4>
        <p className="text-sm text-muted-foreground mb-1">You received an offer from <span className="font-semibold text-foreground">{companyName}</span>!</p>
        {offerLetter.created_at && (
          <p className="text-xs text-muted-foreground mb-4">
            Sent on {new Date(offerLetter.created_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            {" at "}
            {new Date(offerLetter.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><span className="text-muted-foreground">Company:</span> <span className="font-medium text-foreground">{companyName || "—"}</span></div>
          <div><span className="text-muted-foreground">Role:</span> <span className="font-medium text-foreground">{offerLetter.designation}</span></div>
          <div><span className="text-muted-foreground">CTC:</span> <span className="font-medium text-foreground">₹{Number(offerLetter.ctc_total).toLocaleString()}/yr</span></div>
          <div><span className="text-muted-foreground">Joining:</span> <span className="font-medium text-foreground">{offerLetter.joining_date}</span></div>
          <div><span className="text-muted-foreground">Accept by:</span> <span className="font-medium text-foreground">{offerLetter.accept_by}</span></div>
          <div><span className="text-muted-foreground">Location:</span> <span className="font-medium text-foreground">{offerLetter.work_location}</span></div>
          <div><span className="text-muted-foreground">Type:</span> <span className="font-medium text-foreground">{offerLetter.work_type}</span></div>
        </div>
        {offerLetter.status === "sent" && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={async () => {
              await supabase.from("offer_letters").update({ status: "accepted", accepted_at: new Date().toISOString() } as any).eq("id", offerLetter.id);
              await supabase.from("applications").update({ current_stage: "hired", status: "hired" }).eq("id", offerLetter.application_id);
              const { data: hrUsers } = await supabase.from("users").select("id").eq("role", "hr").eq("company_id", offerLetter.company_id);
              for (const hr of (hrUsers || [])) {
                await supabase.from("notifications").insert({ user_id: hr.id, title: "🎉 Offer Accepted!", message: `${user?.full_name} accepted the offer! Joining: ${offerLetter.joining_date}` });
              }
              toast({ title: "🎉 Offer Accepted!", description: "Welcome aboard!" });
              fetchData();
            }} className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> Accept Offer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNegotiationOpen(true)} className="gap-1">💬 Negotiate</Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclineOpen(true)} className="text-destructive gap-1">❌ Decline</Button>
          </div>
        )}
        {offerLetter.status === "accepted" && <p className="text-sm font-semibold text-primary">✅ Offer Accepted</p>}
        {offerLetter.status === "declined" && <p className="text-sm font-semibold text-destructive">Offer Declined</p>}
      </motion.div>
    );
  };

  const renderApplicationQueue = (items: any[], emptyLabel: string) => {
    const selected = journeyApp && items.find((a: any) => a.id === journeyApp.id)
      ? journeyApp
      : (items.length > 0 ? items[0] : null);

    return (
      <div className="space-y-5">
        {/* Top horizontal queue / inbox */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-foreground">
              Inbox · {items.length} {items.length === 1 ? "application" : "applications"}
            </h4>
            {selected && (
              <button onClick={() => setJourneyApp(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Clear selection
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{emptyLabel}</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {items.map((a: any) => {
                const isSel = selected?.id === a.id;
                const isRej = a.status === "rejected";
                const isHired = ["hired", "selected", "onboarded"].includes(a.current_stage);
                return (
                  <button
                    key={a.id}
                    onClick={() => setJourneyApp(a)}
                    className={`shrink-0 min-w-[220px] max-w-[260px] text-left rounded-xl border p-3 transition-all ${
                      isSel
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background/40 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground truncate">{a.jobs?.title || "Job"}</p>
                      {isRej ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        : isHired ? <Trophy className="h-4 w-4 text-green-500 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{a.jobs?.companies?.company_name || "—"}</p>
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      <span className={`text-[10px] uppercase tracking-wide font-semibold ${
                        isRej ? "text-destructive" : isHired ? "text-green-500" : "text-primary"
                      }`}>
                        {isRej ? "Rejected" : isHired ? "Hired" : (a.current_stage || "applied").replace(/_/g, " ")}
                      </span>
                      {((a as any).resume_score != null || (a as any).ai_analysis?.resume_score != null || (a as any).ai_analysis?.score != null) && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                          ATS: {(a as any).resume_score ?? (a as any).ai_analysis?.resume_score ?? (a as any).ai_analysis?.score}/100
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Full-screen detail */}
        {selected ? (
          <ApplicationDetailView
            app={selected}
            gdInfo={gdInfo}
            submittedTest={submittedTestAppIds.has(selected.id)}
            onBack={() => setJourneyApp(null)}
          />
        ) : items.length > 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">Select an application from the inbox above to view full details.</p>
          </div>
        ) : null}
      </div>
    );
  };

  const renderApplications = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-bold text-foreground">My Applications</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick a job from the inbox to see its full hiring journey.
          </p>
        </div>
      </div>

      {activeApps.some((a: any) => a.current_stage === "before_interview" || a.current_stage === "applied") && (
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <h5 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <ScanSearch className="h-4 w-4 text-primary" />
              ⚡ Stage 1: Before Interview Screening Active
            </h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete your personalized 5 MCQs and 2 repo-derived coding challenges with AI error diagnostics to pass into technical interviews.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setActiveTab("before-interview")}
            className="shrink-0 bg-primary text-primary-foreground text-xs self-start sm:self-auto"
          >
            Open Before Interview Tab →
          </Button>
        </div>
      )}

      {renderApplicationQueue(activeApps, "No active applications. Browse jobs to apply.")}
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-bold text-foreground">Application History</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          All rejected and hired applications — including the round you were rejected at and full company details.
        </p>
      </div>
      {renderApplicationQueue(historyApps, "No history yet. Closed and hired applications will appear here.")}
    </div>
  );

  const renderInterviewsTab = () => {
    const Section = ({ title, items, tone, showJoin }: { title: string; items: any[]; tone: string; showJoin: boolean }) => (
      <div>
        <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${tone}`}>{title} ({items.length})</h4>
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Nothing here yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map((interview: any) => (
              <div key={interview.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground capitalize">{String(interview.round_type || "").replace(/_/g, " ")}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                      {interview.scheduled_date && <span>📅 {interview.scheduled_date}</span>}
                      {interview.scheduled_time && <span>⏰ {interview.scheduled_time}</span>}
                      {interview.duration && <span>⏱ {interview.duration} min</span>}
                    </div>
                    {interview.interviewer_name && <p className="text-xs text-muted-foreground mt-1">With: {interview.interviewer_name}</p>}
                  </div>
                  {showJoin && (
                    <button
                      onClick={() => navigate(`/interview-room/${interview.id}`)}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Join
                    </button>
                  )}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
    return (
      <div className="space-y-6">
        <div>
          <h4 className="text-lg font-bold text-foreground">My Interviews</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            You can join an ongoing or scheduled interview any time from here — the room opens automatically. Once the hiring team closes an interview it moves to Over.
          </p>
        </div>
        <Section title="🟢 Ongoing" items={ongoingInterviews} tone="text-primary" showJoin />
        <Section title="📅 Scheduled" items={scheduledInterviews} tone="text-amber-500" showJoin />
        <Section title="✅ Over" items={overInterviews} tone="text-muted-foreground" showJoin={false} />

      </div>
    );
  };





  const renderBrowseJobs = () => (
    <div className="space-y-4">
      <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Search className="h-5 w-5 text-primary" />
        Browse Open Positions
      </h4>
      {browseJobs.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No open positions available right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {browseJobs.map((job: any) => {
            const alreadyApplied = applications.some((a) => a.job_id === job.id);
            return (
              <div key={job.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="font-semibold text-foreground truncate">{job.title}</h5>
                    <p className="text-sm text-muted-foreground truncate">{(job as any).companies?.company_name || "—"}</p>
                  </div>
                  {job.typeFit && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30">
                      ★ Recommended
                    </span>
                  )}
                  {job.skillPct > 0 && (

                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      job.skillPct >= 70 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {job.skillPct}% skills match
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                  <span>📍 {job.location}</span>
                  <span>• {job.work_type}</span>
                  {job.employment_type && <span>• {job.employment_type}</span>}
                  <span>• {job.department}</span>
                  {job.salary_min && job.salary_max && (
                    <span>• ₹{Number(job.salary_min).toLocaleString()} - ₹{Number(job.salary_max).toLocaleString()}</span>
                  )}
                </div>
                {job.skills_required?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {job.skills_required.slice(0, 5).map((s: string) => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{s}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  {alreadyApplied ? (
                    <span className="text-xs font-medium text-primary">✅ Already Applied</span>
                  ) : (
                    <Button size="sm" onClick={() => navigate(`/jobs/${job.id}`)} className="h-7 px-3 text-xs bg-primary text-primary-foreground">
                      Apply Now
                    </Button>
                  )}
                </div>
              </div>

            );
          })}
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h4 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" /> My Profile
        </h4>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="text-sm font-medium text-foreground">Full Name</label>
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input value={user?.email || ""} disabled className="mt-1 opacity-60" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Phone</label>
            <Input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="Enter phone number" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Professional Status</label>
            <Select value={experienceType} onValueChange={(v) => {
              setExperienceType(v);
              if (v !== "experience") setExperienceYears(0);
            }}>
              <SelectTrigger className="mt-1 bg-secondary/50 border-border">
                <SelectValue placeholder="Select professional status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">🎓 Student (No experience)</SelectItem>
                <SelectItem value="fresher">🚀 Fresher (0 years experience)</SelectItem>
                <SelectItem value="experience">💼 Experienced (1+ years experience)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {experienceType === "experience" && (
            <div>
              <label className="text-sm font-medium text-foreground">Years of Experience</label>
              <Input type="number" min={1} max={50} value={experienceYears || ""} onChange={(e) => setExperienceYears(Number(e.target.value))} className="mt-1 bg-secondary/50 border-border" />
            </div>
          )}
          <Button size="sm" disabled={profileUpdating} onClick={async () => {
            if (!user) return;
            setProfileUpdating(true);
            const expJson = JSON.stringify({ type: experienceType, years: experienceYears });
            const { error } = await supabase
              .from("users")
              .update({ 
                full_name: profileName, 
                phone: profilePhone,
                department: expJson
              })
              .eq("id", user.id);
            if (error) {
              toast({ title: "Error", description: error.message, variant: "destructive" });
            } else {
              toast({ title: "✅ Profile Updated" });
              setUser({ ...user, full_name: profileName, phone: profilePhone, department: expJson });
              fetchData();
            }
            setProfileUpdating(false);
          }} className="bg-primary text-primary-foreground">
            {profileUpdating ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </div>

      {/* Change Password */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h5 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" /> Change Password
        </h5>
        <div className="space-y-3 max-w-md">
          <div>
            <label className="text-sm font-medium text-foreground">Current Password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">New Password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="mt-1" />
          </div>
          <Button size="sm" variant="outline" disabled={changingPassword || !currentPassword || !newPassword} onClick={async () => {
            if (!currentPassword || !newPassword) return;
            if (newPassword.length < 6) {
              toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
              return;
            }
            setChangingPassword(true);
            const { error: signInError } = await supabase.auth.signInWithPassword({ email: user?.email || "", password: currentPassword });
            if (signInError) {
              toast({ title: "Error", description: "Current password is incorrect.", variant: "destructive" });
              setChangingPassword(false);
              return;
            }
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
              toast({ title: "Error", description: error.message, variant: "destructive" });
            } else {
              toast({ title: "✅ Password Changed Successfully" });
              setCurrentPassword("");
              setNewPassword("");
            }
            setChangingPassword(false);
          }}>
            {changingPassword ? "Changing..." : "Change Password"}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderBGV = () => {
    if (applications[0]?.current_stage !== "hired") return null;
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h4 className="text-lg font-bold text-foreground mb-2">📋 Document Submission (BGV)</h4>
        <p className="text-sm text-muted-foreground mb-4">Please upload the following documents for verification.</p>
        {["Degree Certificate", "Experience Letter", "Last 3 Salary Slips", "Aadhaar Card", "PAN Card", "Bank Details"].map(docType => {
          const existing = bgvDocs.find(d => d.document_type === docType);
          return (
            <div key={docType} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                {existing ? <CheckCircle2 className={`h-4 w-4 ${existing.verified ? "text-primary" : "text-amber-500"}`} /> : <div className="h-4 w-4 rounded border border-border" />}
                <span className="text-sm text-foreground">{docType}</span>
                {existing?.verified && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Verified</span>}
              </div>
              {existing ? (
                <span className="text-xs text-primary">Uploaded</span>
              ) : (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user || !applications[0]) return;
                    setUploading(docType);
                    const path = `${user.id}/${docType.replace(/ /g, "_")}_${Date.now()}.${file.name.split(".").pop()}`;
                    const { error: uploadError } = await supabase.storage.from("bgv-documents").upload(path, file);
                    if (uploadError) { toast({ title: "Upload Error", description: uploadError.message, variant: "destructive" }); setUploading(null); return; }
                    await supabase.from("bgv_documents").insert({ application_id: applications[0].id, candidate_id: user.id, document_type: docType, file_url: path } as any);
                    toast({ title: "✅ Uploaded", description: `${docType} uploaded successfully.` });
                    setUploading(null);
                    fetchData();
                  }} />
                  <span className="text-xs text-primary hover:underline flex items-center gap-1">
                    {uploading === docType ? <Loader2 className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                    Upload
                  </span>
                </label>
              )}
            </div>
          );
        })}
        <div className="mt-3">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(bgvDocs.length / 6) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{bgvDocs.length}/6 documents uploaded</p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "applications":
        return (
          <div className="space-y-6">
            {renderApplications()}
            {renderBGV()}
          </div>
        );
      case "offer":
        return offerLetter ? (
          renderOfferSection()
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h4 className="text-lg font-bold text-foreground mb-2">Offer Letter</h4>
            <p className="text-sm text-muted-foreground">No offer letter yet. It appears here as soon as the company sends one.</p>
          </div>
        );
      case "history":
        return renderHistory();
      case "before-interview":
      case "before_interview":
      case "beforeinterview":
        return <BeforeInterviewCandidatePanel />;
      case "interviews":
        return renderInterviewsTab();
      case "browse":
        return renderBrowseJobs();
      case "profile":
        return renderProfile();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar-background fixed left-0 top-0 h-screen z-30">
        <div className="p-6">
          <BrandLogo className="mb-1" markClassName="h-9 w-9" textClassName="text-xl" />
          <p className="text-xs text-primary font-medium">Candidate dashboard</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {sidebarLinks.map(({ icon: Icon, label, key, badge }) => (
            <button
              key={key}
              onClick={() => {
                if (key === "profile") navigate("/profile");
                else if (key === "resume-builder") navigate("/resume-builder");
                else if (key === "my-analytics") navigate("/my-analytics");
                else {
                  setActiveTab(key);
                  if (key === "messages") setUnreadMessages(0);
                }
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                activeTab === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {typeof badge === "number" && badge > 0 ? (
                <span className="ml-auto h-5 w-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">Candidate</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-64">
        {/* Top navbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border px-6 py-4 bg-card/50 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-foreground capitalize">{activeTab === "dashboard" ? "Dashboard" : activeTab.replace(/_/g, " ")}</h2>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationsBell
              notifications={notifications}
              onMarkedAllRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
            />
            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {photoUrl ? <img src={photoUrl} alt={user?.full_name} className="h-full w-full object-cover" /> : <User className="h-4 w-4 text-primary" />}
            </div>
          </div>
        </header>

        {/* Mobile tabs */}
        <div className="md:hidden px-4 pt-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full overflow-x-auto">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="applications">Apps</TabsTrigger>
              <TabsTrigger value="before-interview">Before Interview</TabsTrigger>
              <TabsTrigger value="browse">Jobs</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <main className="flex-1 p-6">
          {renderContent()}
        </main>
      </div>

      {/* Floating AI Assistant */}
      <AIAssistant
        candidateId={user?.id ?? null}
        jobs={applications.map((a: any) => ({
          id: a.job_id,
          title: a?.jobs?.title ?? "Application",
          company: a?.jobs?.companies?.company_name,
        }))}
      />

      {/* Journey Drawer */}
      <JourneyDrawer
        open={!!journeyApp && activeTab !== "applications" && activeTab !== "history"}
        onClose={() => setJourneyApp(null)}
        app={journeyApp as any}
        gdInfo={gdInfo}
        submittedTest={journeyApp ? submittedTestAppIds.has(journeyApp.id) : false}
      />



      {/* Decline Dialog */}
      {declineOpen && offerLetter && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-border bg-card p-6 w-full max-w-sm space-y-4">
            <h4 className="text-lg font-bold text-foreground">Decline Offer</h4>
            <Select value={declineReason} onValueChange={setDeclineReason}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Got better offer">Got better offer</SelectItem>
                <SelectItem value="Personal reasons">Personal reasons</SelectItem>
                <SelectItem value="Location issue">Location issue</SelectItem>
                <SelectItem value="Salary not matching">Salary not matching</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeclineOpen(false)} className="flex-1">Cancel</Button>
              <Button variant="destructive" onClick={async () => {
                await supabase.from("offer_letters").update({ status: "declined", decline_reason: declineReason } as any).eq("id", offerLetter.id);
                const { data: hrUsers } = await supabase.from("users").select("id").eq("role", "hr").eq("company_id", offerLetter.company_id);
                for (const hr of (hrUsers || [])) {
                  await supabase.from("notifications").insert({ user_id: hr.id, title: "❌ Offer Declined", message: `${user?.full_name} declined the offer. Reason: ${declineReason}` });
                }
                toast({ title: "Offer Declined" });
                setDeclineOpen(false);
                fetchData();
              }} className="flex-1">Confirm Decline</Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Onboarding */}
      {applications[0]?.current_stage === "onboarded" && activeTab === "dashboard" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl border-2 border-primary/30 bg-card shadow-xl p-4">
          <h4 className="text-sm font-bold text-foreground mb-2">🎉 Welcome to {companyName}!</h4>
          <div className="space-y-1.5">
            {[
              { time: "9:00 AM", task: "Collect laptop & ID card" },
              { time: "10:00 AM", task: "HR induction" },
              { time: "11:00 AM", task: "Meet your team" },
              { time: "2:00 PM", task: "System setup & access" },
            ].map(item => (
              <div key={item.time} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground w-16">{item.time}</span>
                <span className="text-foreground">{item.task}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Negotiation Chat */}
      {offerLetter && (
        <NegotiationChat
          offerId={offerLetter.id}
          currentUserId={user?.id || ""}
          currentUserRole="candidate"
          currentUserName={user?.full_name || ""}
          open={negotiationOpen}
          onOpenChange={setNegotiationOpen}
        />
      )}

      {/* Onboarding Modal Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6"
          >
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Zap className="h-6 w-6 text-primary fill-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Welcome to HireZap!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Tell us a bit about your experience to customize your job search.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Current Status
                </label>
                <Select
                  value={onboardingType}
                  onValueChange={(v: any) => {
                    setOnboardingType(v);
                    if (v !== "experience") setOnboardingYears(0);
                  }}
                >
                  <SelectTrigger className="h-12 bg-secondary/50 border-border">
                    <SelectValue placeholder="Select your experience level..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">🎓 Student (No experience)</SelectItem>
                    <SelectItem value="fresher">🚀 Fresher (0 years experience)</SelectItem>
                    <SelectItem value="experience">💼 Experienced (1+ years experience)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {onboardingType === "experience" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2"
                >
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Years of Experience
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Enter years (e.g. 2)"
                    value={onboardingYears || ""}
                    onChange={(e) => setOnboardingYears(Number(e.target.value))}
                    className="h-12 bg-secondary/50 border-border"
                  />
                </motion.div>
              )}
            </div>

            <Button
              onClick={handleOnboardingSubmit}
              disabled={onboardingSubmitting || (onboardingType === "experience" && !onboardingYears)}
              className="w-full h-12 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(160,100%,45%,0.2)] transition-all"
            >
              {onboardingSubmitting ? "Saving Profile..." : "Get Started"}
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CandidateDashboard;
