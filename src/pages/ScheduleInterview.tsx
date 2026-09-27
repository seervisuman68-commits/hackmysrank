import { sendStageEmail } from "@/lib/stageEmail";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Loader2 } from "@/components/BrandLoader";

const ScheduleInterview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);

  const [candidateId, setCandidateId] = useState("");
  const [roundType, setRoundType] = useState("hr_interview");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [mode, setMode] = useState("video_call");
  // Meeting room is provisioned by VideoSDK on first join — no manual link input.
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const { data: user } = await supabase
        .from("users")
        .select("id, full_name, company_id, role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!user?.company_id) return;
      setCurrentUser(user);

      // Get candidates at hr_interview stage for this company
      const { data: jobs } = await supabase.from("jobs").select("id").eq("company_id", user.company_id);
      if (!jobs?.length) { setLoading(false); return; }

      const { data: apps } = await supabase
        .from("applications")
        .select("id, candidate_id, job_id, current_stage")
        .in("job_id", jobs.map(j => j.id))
        .in("current_stage", ["hr_interview", "interview", "gd_completed"]);

      if (apps?.length) {
        const candidateIds = [...new Set(apps.map(a => a.candidate_id))];
        const { data: users } = await supabase.from("users").select("id, full_name, email").in("id", candidateIds);
        const { data: jobsData } = await supabase.from("jobs").select("id, title").in("id", [...new Set(apps.map(a => a.job_id))]);
        const jobMap = Object.fromEntries((jobsData || []).map(j => [j.id, j.title]));
        const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

        setCandidates(apps.map(a => ({
          ...a,
          candidate_name: userMap[a.candidate_id]?.full_name || "Unknown",
          candidate_email: userMap[a.candidate_id]?.email || "",
          job_title: jobMap[a.job_id] || "Unknown",
        })));
      }
      setLoading(false);
    })();
  }, [navigate]);

  const handleSubmit = async () => {
    if (!candidateId || !scheduledDate || !scheduledTime) {
      toast({ title: "Missing Fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const selected = candidates.find(c => c.candidate_id === candidateId);
      if (!selected || !currentUser) return;

      // The meeting room is created on first join (by the create-video-room
      // function) and then persisted, so HR and the candidate always land in
      // the same room. Nothing to provision at scheduling time.


      const { error } = await supabase.from("interviews").insert({
        application_id: selected.id,
        candidate_id: selected.candidate_id,
        job_id: selected.job_id,
        company_id: currentUser.company_id,
        round_type: roundType,
        interviewer_id: currentUser.id,
        interviewer_name: currentUser.full_name,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration: parseInt(duration),
        mode,
        meeting_link: null,
        daily_room_name: null,
        daily_room_url: null,

        notes,
        status: "scheduled",
      } as any);

      if (error) throw error;

      // Update application stage
      await supabase.from("applications").update({ current_stage: "hr_interview", status: "active" }).eq("id", selected.id);

      // Notify candidate
      const modeLabel = mode === "video_call" ? "Video Call" : mode === "phone_call" ? "Phone Call" : "In Person";
      try {
        sendStageEmail({
          applicationId: selected.id,
          event: "round_scheduled",
          stage: roundType,
          scheduledAt: `${scheduledDate} at ${scheduledTime}`,
          durationMins: parseInt(duration),
          mode,
        });
      } catch (emErr) {
        console.warn("Stage email warning:", emErr);
      }

      try {
        await supabase.from("notifications").insert({
          user_id: selected.candidate_id,
          title: "🎉 HR Interview Scheduled!",
          message: `Congratulations! Your ${roundType.replace(/_/g, " ")} interview is scheduled.\n\n📅 Date: ${scheduledDate}\n⏰ Time: ${scheduledTime}\n⏱ Duration: ${duration} minutes\n📍 Mode: ${modeLabel}${mode === "video_call" ? "\n🔗 Join from your dashboard — the meeting room opens there." : ""}\n👤 With: ${currentUser.full_name}\n\nPlease be ready 5 minutes early. Keep your resume handy. All the best! 🎯`,
        });
      } catch (notifErr) {
        console.warn("Candidate notification warning:", notifErr);
      }

      // If manager schedules, notify HR
      if (currentUser.role === "manager") {
        try {
          const { data: hrUsers } = await supabase.from("users").select("id").eq("role", "hr").eq("company_id", currentUser.company_id);
          for (const hr of (hrUsers || [])) {
            await supabase.from("notifications").insert({
              user_id: hr.id,
              title: "📅 Interview Scheduled by Manager",
              message: `${currentUser.full_name} scheduled ${roundType.replace(/_/g, " ")} for ${selected.candidate_name} on ${scheduledDate} at ${scheduledTime}.`,
            });
          }
        } catch (hrNotifErr) {
          console.warn("HR notification warning:", hrNotifErr);
        }
      }

      toast({ title: "✅ Interview Scheduled!", description: `${selected.candidate_name} has been notified.` });
      navigate(currentUser.role === "manager" ? "/manager-dashboard" : "/hr-dashboard");
    } catch (e: any) {
      console.error("Schedule interview error:", e);
      toast({ title: "Error", description: e.message || "Failed to schedule interview", variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Schedule Interview</h1>
            <p className="text-sm text-muted-foreground">Set up an interview round for a candidate</p>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-6 space-y-5">
          {/* Candidate */}
          <div className="space-y-2">
            <Label>Select Candidate *</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger><SelectValue placeholder="Choose candidate..." /></SelectTrigger>
              <SelectContent>
                {candidates.map(c => (
                  <SelectItem key={c.candidate_id} value={c.candidate_id}>
                    {c.candidate_name} — {c.job_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Round Type */}
          <div className="space-y-2">
            <Label>Interview Round *</Label>
            <Select value={roundType} onValueChange={setRoundType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hr_interview">HR Interview</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="managerial">Managerial</SelectItem>
                <SelectItem value="final_round">Final Round</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Interviewer */}
          <div className="space-y-2">
            <Label>Interviewer Name</Label>
            <Input value={currentUser?.full_name || ""} disabled className="bg-muted" />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="90">90 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="video_call">Video Call</SelectItem>
                <SelectItem value="phone_call">Phone Call</SelectItem>
                <SelectItem value="in_person">In Person</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Meeting Link - Auto-generated */}
          {mode === "video_call" && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                🎥 A secure in-app video room opens for both of you the moment either side clicks Join. Screen share and chat are enabled.
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes for Candidate</Label>
            <Textarea placeholder="Any special instructions..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            {submitting ? "Scheduling..." : "Schedule Interview"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default ScheduleInterview;
