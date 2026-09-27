import { JOB_COLUMNS } from "@/lib/jobColumns";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLiveData } from "@/hooks/useLiveData";
import {
  Zap, BarChart3, Settings, Bell, LogOut, Plus, Users, Briefcase,
  MessageSquare, Calendar, LayoutDashboard, Award, Workflow, ScanSearch,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddJobPanel from "@/components/AddJobPanel";
import HRJobsView from "@/components/hr/HRJobsView";
import HRCandidatesView from "@/components/hr/HRCandidatesView";
import HRInterviewsView from "@/components/hr/HRInterviewsView";
import BeforeInterviewHRPanel from "@/components/hr/BeforeInterviewHRPanel";
import ChatSystem from "@/components/ChatSystem";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import { useToast } from "@/hooks/use-toast";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import CompanyProfileEditor from "@/components/admin/CompanyProfileEditor";
import HiringHistoryView from "@/components/HiringHistoryView";
import JobTemplatesManager from "@/components/hr/JobTemplatesManager";
import OfferTemplatesManager from "@/components/hr/OfferTemplatesManager";

interface JobRow {
  id: string;
  title: string;
  department: string;
  manager_id: string | null;
  salary_min: number | null;
  salary_max: number | null;
  location: string;
  work_type: string;
  applications_count: number;
  status: string;
  created_at: string;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Briefcase, label: "Jobs" },
  { icon: Users, label: "Candidates" },
  { icon: ScanSearch, label: "Before Interview" },
  { icon: Users, label: "Group Discussion" },
  { icon: Calendar, label: "Interviews" },
  { icon: Workflow, label: "Interview Process" },
  { icon: Award, label: "Hiring History" },
  { icon: BarChart3, label: "Analytics" },
];

const HRDashboard = () => {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [candidatesInitialJobId, setCandidatesInitialJobId] = useState<string | null>(null);
  const [hrName, setHrName] = useState("");
  const [hrUserId, setHrUserId] = useState("");
  const [userRole, setUserRole] = useState<"hr" | "manager">("hr");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [totalApplications, setTotalApplications] = useState(0);
  const [shortlistedCount, setShortlistedCount] = useState(0);
  const [jobStats, setJobStats] = useState<{ id: string; title: string; status: string; applications: number; shortlisted: number; rejected: number }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string }[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; created_at: string; read: boolean }[]>([]);
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [latestNotif, setLatestNotif] = useState<{ title: string; message: string } | null>(null);
  const [liveActivities, setLiveActivities] = useState<{ message: string; time: string }[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail && typeof e.detail === "string") {
        setActiveNav(e.detail);
      }
    };
    window.addEventListener("hz_switch_hr_tab", handleSwitchTab);
    return () => window.removeEventListener("hz_switch_hr_tab", handleSwitchTab);
  }, []);

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: user } = await supabase
      .from("users")
      .select("id, full_name, company_id, role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!user) return;

    setHrName(user.full_name);
    setHrUserId(user.id);
    if (user.role === "manager" || user.role === "hr") {
      setUserRole(user.role as "hr" | "manager");
    }

    if (user.company_id) {
      setCompanyId(user.company_id);

      const { data: company } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", user.company_id)
        .maybeSingle();
      if (company) setCompanyName(company.company_name);

      const { data: jobsData } = await supabase
        .from("jobs")
        .select(JOB_COLUMNS)
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false });
      if (jobsData) {
        setJobs(jobsData as JobRow[]);
        const jobIds = jobsData.map((j: any) => j.id);
        if (jobIds.length > 0) {
          const { data: apps } = await supabase
            .from("applications")
            .select("id, current_stage, status, job_id")
            .in("job_id", jobIds);
          if (apps) {
            const shortlistStages = ["shortlisted", "aptitude_test", "test_completed", "video_intro", "video_submitted", "technical_round", "technical_test", "technical_completed", "group_discussion", "gd_completed", "interview", "hr_interview"];
            const isActive = (a: any) => a.status !== "rejected" && a.status !== "deleted";
            setTotalApplications(apps.filter(isActive).length);
            setShortlistedCount(apps.filter((a: any) => shortlistStages.includes(a.current_stage) && isActive(a)).length);
            const perJob = jobsData.map((j: any) => {
              const jobApps = apps.filter((a: any) => a.job_id === j.id);
              return {
                id: j.id,
                title: j.title,
                status: j.status,
                applications: jobApps.filter(isActive).length,
                shortlisted: jobApps.filter((a: any) => shortlistStages.includes(a.current_stage) && isActive(a)).length,
                rejected: jobApps.filter((a: any) => a.status === "rejected").length,
              };
            });
            setJobStats(perJob);
          }
        } else {
          setJobStats([]);
        }
      }

      const { data: mgrs } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "manager")
        .eq("company_id", user.company_id);
      if (mgrs) setManagers(mgrs);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const fetchNotifications = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!userData) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userData.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setNotifications(data as any);
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!hrUserId) return;
    const channel = supabase
      .channel(`hr-notifications-${hrUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${hrUserId}` },
        (payload) => {
          const newNotif = payload.new as any;
          setNotifications((prev) => [newNotif, ...prev]);
          setLatestNotif({ title: newNotif.title, message: newNotif.message });
          setTimeout(() => setLatestNotif(null), 8000);
          setLiveActivities((prev) => [
            { message: newNotif.message, time: "Just now" },
            ...prev.slice(0, 9),
          ]);
          fetchData();
          toast({
            title: `🔔 ${newNotif.title}`,
            description: (newNotif.message || "").substring(0, 120),
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [hrUserId]);

  // Live sync: any change to jobs / applications / offers / interviews refreshes the dashboard data
  useLiveData(
    ["jobs", "applications", "offer_letters", "interviews", "candidate_profiles", "round_briefs", "round_scores", "assessments"],
    () => { fetchData(); fetchNotifications(); },
    { key: "hr-live-data" },
  );


  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const stats = [
    { icon: Briefcase, label: "Total Jobs Posted", value: jobs.length, color: "text-primary" },
    { icon: Users, label: "Total Applications", value: totalApplications, color: "text-blue-400" },
    { icon: Users, label: "Shortlisted", value: shortlistedCount, color: "text-amber-400" },
    { icon: Calendar, label: "Interviews Today", value: 0, color: "text-purple-400" },
  ];

  const renderContent = () => {
    switch (activeNav) {
      case "Jobs":
        return <HRJobsView jobs={jobs} managers={managers} onPostJob={() => setPanelOpen(true)} onJobUpdated={fetchData} />;
      case "Candidates":
        return <HRCandidatesView companyId={companyId} initialJobId={candidatesInitialJobId} />;
      case "Before Interview":
        return <BeforeInterviewHRPanel />;
      case "Group Discussion":
        return (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Opening Group Discussion Dashboard...
          </div>
        );
      case "Interviews":
        return <HRInterviewsView companyId={companyId} />;
      case "Hiring History":
        return <HiringHistoryView companyId={companyId} canDelete={userRole === "hr"} />;
      case "Analytics":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
                  <p className="text-sm text-muted-foreground">Choose a report to open in full view.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("/hr-analytics")}>
                    <BarChart3 className="mr-2 h-4 w-4" /> HR Recruitment Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/manager-analytics")}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Hiring Manager Analytics
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        // Dashboard view
        return (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {stats.map(({ icon: Icon, label, value, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{value}</p>
                </motion.div>
              ))}
            </div>

            {/* Per-Job Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl border border-border bg-card mb-6 overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Per-Job Breakdown</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Applications & shortlists for each job you posted</p>
                </div>
                <button
                  onClick={() => setActiveNav("Jobs")}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Manage all jobs →
                </button>
              </div>
              {jobStats.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No jobs posted yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-6 py-3">Job Title</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-center font-medium px-4 py-3">Applications</th>
                        <th className="text-center font-medium px-4 py-3">Shortlisted</th>
                        <th className="text-center font-medium px-4 py-3">Rejected</th>
                        <th className="text-right font-medium px-6 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobStats.map((j) => (
                        <tr key={j.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                          <td className="px-6 py-3 font-medium text-foreground">{j.title}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              j.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            }`}>
                              {j.status.charAt(0).toUpperCase() + j.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-blue-400 font-semibold">{j.applications}</td>
                          <td className="px-4 py-3 text-center text-amber-400 font-semibold">{j.shortlisted}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{j.rejected}</td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => { setCandidatesInitialJobId(j.id); setActiveNav("Candidates"); }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              View candidates →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>


            {/* Live Activity Feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl border border-border bg-card p-6 mb-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-foreground">Live Activity</h2>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                  </span>
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider">Live</span>
                </div>
              </div>
              {liveActivities.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity yet. Post a job to get started.</p>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {liveActivities.map((activity, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-3 text-sm"
                      >
                        <span className="text-primary">📄</span>
                        <div>
                          <p className="text-foreground">{activity.message}</p>
                          <p className="text-xs text-muted-foreground">{activity.time}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>

            {/* Recent Jobs Summary */}
            <HRJobsView jobs={jobs.slice(0, 5)} managers={managers} onPostJob={() => setPanelOpen(true)} onJobUpdated={fetchData} />
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -260 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-border bg-card"
      >
        <div className="px-5 py-6 border-b border-border">
          <BrandLogo markClassName="h-8 w-8" textClassName="text-xl" />
          {companyName && (
            <p className="text-xs text-primary mt-2 truncate">{companyName}</p>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Interview Process") { navigate("/interview-process"); return; }
                if (label === "Group Discussion") { navigate("/gd-dashboard"); return; }
                if (label === "Candidates") setCandidatesInitialJobId(null);
                setActiveNav(label);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                activeNav === label
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-4">
          <p className="text-sm font-medium text-foreground truncate">{hrName || (userRole === "manager" ? "Manager" : "HR Manager")}</p>
          <p className="text-xs text-muted-foreground mb-3">{userRole === "manager" ? "Hiring Manager" : "HR Manager"}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </motion.aside>

      {/* Main */}
      <div className="ml-60 flex-1 flex flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-8 py-4">
          <h1 className="text-xl font-bold text-foreground">{userRole === "manager" ? "Hiring Manager — " : ""}{activeNav}</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />

            <div className="relative">
              <button
                onClick={() => setShowNotifPopup(!showNotifPopup)}
                className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center text-[10px] text-destructive-foreground font-bold">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              {showNotifPopup && (
                <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-xl z-50">
                  <div className="p-3 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Notifications</p>
                  </div>
                  <button onClick={() => { setShowNotifPopup(false); navigate("/notifications"); }} className="w-full text-center text-xs font-medium text-primary hover:bg-secondary py-2.5 border-b border-border">
                    View all notifications →
                  </button>
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`p-3 border-b border-border last:border-0 ${!n.read ? "bg-primary/5" : ""}`}>
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {hrName?.charAt(0)?.toUpperCase() || "H"}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8">
          {renderContent()}
        </main>
      </div>

      <AddJobPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        companyId={companyId}
        hrUserId={hrUserId}
        managers={managers}
        onJobCreated={fetchData}
      />

      {/* Floating notification popup */}
      <AnimatePresence>
        {latestNotif && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-primary/30 bg-card shadow-2xl shadow-primary/10 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">🔔</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{latestNotif.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{latestNotif.message}</p>
              </div>
              <button onClick={() => setLatestNotif(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating AI Assistant (HR mode) */}
      <AIAssistantWidget mode={userRole} />
    </div>
  );
};

export default HRDashboard;
