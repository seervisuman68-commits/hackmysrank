import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { Shield, Clock, Camera, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ScreenSharePreview from "@/components/ScreenSharePreview";
import { cleanAudioConstraints, attachViolationListeners, startScreenRecording, startFaceGuard, type ScreenRecorder } from "@/lib/proctoring";
import { normalizePipeline, enabledStages } from "@/lib/pipeline";
import { generateComprehensiveAptitudeQuestions } from "@/lib/assessmentGenerator";


interface TestQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  time_seconds: number;
  section?: string;
}

const AptitudeTest = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Auth & access
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessMessage, setAccessMessage] = useState("The aptitude test is not available for you yet. You will receive a notification when HR opens the test for your profile.");
  const [application, setApplication] = useState<any>(null);
  const [candidateId, setCandidateId] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);

  // Test state
  const [phase, setPhase] = useState<"rules" | "test" | "submitted">("rules");
  const [agreed, setAgreed] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [timeLeft, setTimeLeft] = useState(45 * 60);
  const [testMinutes, setTestMinutes] = useState(45);
  const [passCutoff, setPassCutoff] = useState<number | null>(null);
  const [roundLabel, setRoundLabel] = useState("Aptitude Test");

  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [timePerQuestion, setTimePerQuestion] = useState<number[]>([]);
  const [violations, setViolations] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [cameraAlert, setCameraAlert] = useState(false);
  const [cameraCautionText, setCameraCautionText] = useState("Monitoring environment");

  // Webcam
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const violationCooldownRef = useRef<Record<string, number>>({});
  const screenRecorderRef = useRef<ScreenRecorder | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const faceGuardStopRef = useRef<null | (() => void)>(null);
  const extraListenersStopRef = useRef<null | (() => void)>(null);

  // Check authorization and load questions from assessments
  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const { data: user } = await supabase
        .from("users")
        .select("id, role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!user || user.role !== "candidate") {
        setLoading(false);
        return;
      }

      setCandidateId(user.id);

      // Block if already completed
      const { data: completedApp } = await supabase
        .from("applications")
        .select("id")
        .or(`candidate_id.eq.${user.id},candidate_id.eq.${session.user.id}`)
        .eq("current_stage", "test_completed")
        .maybeSingle();

      if (completedApp) {
        setAccessMessage("You already submitted this test. Retake is not allowed.");
        setLoading(false);
        return;
      }

      let { data: app } = await supabase
        .from("applications")
        .select("*")
        .or(`candidate_id.eq.${user.id},candidate_id.eq.${session.user.id}`)
        .eq("current_stage", "aptitude_test")
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (!app) {
        // Fallback: check all candidate applications
        const { data: allApps } = await supabase
          .from("applications")
          .select("*")
          .or(`candidate_id.eq.${user.id},candidate_id.eq.${session.user.id}`)
          .in("current_stage", ["aptitude_test", "shortlisted", "active"])
          .order("created_at", { ascending: false });

        if (allApps && allApps.length > 0) {
          app = allApps.find((a) => a.current_stage === "aptitude_test") || allApps[0];
        }
      }

      if (app) {
        // Also block if answers already exist (submission done but stage not updated)
        const { count: existingAnswersCount } = await supabase
          .from("test_answers")
          .select("id", { count: "exact", head: true })
          .eq("application_id", app.id);

        if ((existingAnswersCount || 0) > 0) {
          setAccessMessage("You already submitted this test. Retake is not allowed.");
          setLoading(false);
          return;
        }

        setApplication(app);

        // Round settings come from the interview-process template HR chose for THIS job
        let jobSkills: string[] = [];
        if (app.job_id) {
          const { data: job } = await supabase
            .from("jobs")
            .select("title, skills_required, aptitude_cutoff, pipeline_stages")
            .eq("id", app.job_id)
            .maybeSingle();
          if (job) {
            jobSkills = Array.isArray(job.skills_required) ? job.skills_required : [];
            const stages = enabledStages(normalizePipeline((job as any).pipeline_stages));
            const testStage = stages.find((s) => s.type === "test");
            if (testStage) {
              setRoundLabel(testStage.label || "Aptitude Test");
              const mins = Number(testStage.config?.duration);
              if (mins > 0) { setTestMinutes(mins); setTimeLeft(mins * 60); }
              const cut = testStage.config?.cutoff ?? (job as any).aptitude_cutoff;
              if (cut != null) setPassCutoff(Number(cut));
            } else if ((job as any).aptitude_cutoff != null) {
              setPassCutoff(Number((job as any).aptitude_cutoff));
            }
          }
        }

        // Load approved assessment questions (with fallback chain)
        let candidateQuestions: any = null;
        try {
          const { data: assessmentRaw } = await supabase.rpc("get_candidate_assessment", {
            _application_id: app.id,
            _type: "aptitude",
          });
          if (assessmentRaw && (assessmentRaw as any).questions) {
            candidateQuestions = (assessmentRaw as any).questions;
          }
        } catch (rpcErr) {
          console.warn("RPC get_candidate_assessment error, trying direct query:", rpcErr);
        }

        if (!candidateQuestions?.sections || candidateQuestions.sections.length === 0) {
          // Direct table query
          const { data: directAssess } = await supabase
            .from("assessments")
            .select("questions")
            .eq("application_id", app.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (directAssess?.questions && (directAssess.questions as any).sections) {
            candidateQuestions = directAssess.questions;
          }
        }

        if (!candidateQuestions?.sections || candidateQuestions.sections.length === 0) {
          // Client deterministic fallback
          const generated = generateComprehensiveAptitudeQuestions(roundLabel || "Software Engineer", jobSkills);
          candidateQuestions = generated;
        }

        if (candidateQuestions?.sections) {
          const flatQuestions: TestQuestion[] = [];
          for (const section of candidateQuestions.sections) {
            for (const q of section.questions) {
              flatQuestions.push({ ...q, section: section.name });
            }
          }
          setQuestions(flatQuestions);
          setAnswers(Array(flatQuestions.length).fill(null));
          setTimePerQuestion(Array(flatQuestions.length).fill(0));
          setAuthorized(true);
        }
      }
      setLoading(false);
    };
    checkAccess();
  }, []);

  // Timer
  useEffect(() => {
    if (phase !== "test") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Anti-cheat: Tab switch detection
  useEffect(() => {
    if (phase !== "test") return;

    const handleVisibility = () => {
      if (document.hidden) {
        recordViolation("tab_switch", `Switched tab at question ${currentQ + 1}`);
        toast({
          title: "⚠️ Tab switch detected!",
          description: "This has been reported to HR. 3 violations = test cancelled.",
          variant: "destructive",
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase, currentQ]);

  // Anti-cheat: Copy/Paste/Right-click
  useEffect(() => {
    if (phase !== "test") return;

    const blockCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation("copy_paste", `Copy/paste attempted at question ${currentQ + 1}`);
      toast({ title: "⚠️ Copy/Paste blocked!", description: "This action is not allowed.", variant: "destructive" });
    };

    const blockContext = (e: MouseEvent) => {
      e.preventDefault();
      toast({ title: "Right-click disabled", description: "Right-click is not allowed during the test." });
    };

    const blockKeys = (e: KeyboardEvent) => {
      // Block Ctrl+C, Ctrl+V, Ctrl+A, F12, etc.
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "a", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        recordViolation("copy_paste", `Keyboard shortcut blocked at question ${currentQ + 1}`);
      }
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
        e.preventDefault();
      }
    };

    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys);

    return () => {
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys);
    };
  }, [phase, currentQ]);

  const recordViolation = async (type: string, desc: string) => {
    setViolations((v) => v + 1);
    if (!application) return;

    await supabase.from("test_violations").insert({
      application_id: application.id,
      candidate_id: candidateId,
      job_id: application.job_id,
      violation_type: type,
      description: desc,
      question_number: currentQ + 1,
    });
  };

  // Motion & Sound detection
  useEffect(() => {
    if (phase !== "test") return;

    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvasRef.current = canvas;

    let alertTimeout: ReturnType<typeof setTimeout> | null = null;
    let motionStreak = 0;
    let soundStreak = 0;

    const maybeRecordViolation = async (type: string, description: string, cooldownMs = 12000) => {
      const now = Date.now();
      const lastLogged = violationCooldownRef.current[type] ?? 0;
      if (now - lastLogged < cooldownMs) return;
      violationCooldownRef.current[type] = now;
      await recordViolation(type, description);
    };

    const detectInterval = setInterval(() => {
      let motionDetected = false;
      let soundDetected = false;

      // Motion detection via frame diff
      if (videoRef.current && ctx && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        const currentFrame = ctx.getImageData(0, 0, 160, 120);

        if (prevFrameRef.current) {
          let diffSum = 0;
          const prev = prevFrameRef.current.data;
          const curr = currentFrame.data;
          for (let i = 0; i < curr.length; i += 16) {
            diffSum += Math.abs(curr[i] - prev[i]);
          }
          const avgDiff = diffSum / (curr.length / 16);
          motionStreak = avgDiff > 25 ? motionStreak + 1 : Math.max(0, motionStreak - 1);
          motionDetected = motionStreak >= 3;
        }
        prevFrameRef.current = currentFrame;
      }

      // Sound detection
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        soundStreak = avg > 30 ? soundStreak + 1 : Math.max(0, soundStreak - 1);
        soundDetected = soundStreak >= 3;
      }

      if (motionDetected || soundDetected) {
        const possiblePhone = motionDetected && soundDetected;

        setCameraAlert(true);
        setCameraCautionText(
          possiblePhone
            ? "Caution: possible external device/activity detected"
            : motionDetected
            ? "Caution: suspicious movement detected"
            : "Caution: suspicious sound detected"
        );

        if (alertTimeout) clearTimeout(alertTimeout);
        alertTimeout = setTimeout(() => {
          setCameraAlert(false);
          setCameraCautionText("Monitoring environment");
        }, 2200);

        if (motionDetected) {
          void maybeRecordViolation("motion_detected", `Suspicious movement detected near candidate at question ${currentQ + 1}`);
        }

        if (soundDetected) {
          void maybeRecordViolation("sound_detected", `Suspicious sound detected near candidate at question ${currentQ + 1}`);
        }

        if (possiblePhone) {
          void maybeRecordViolation(
            "possible_phone_usage",
            `Simultaneous motion and sound spikes indicate possible external device usage at question ${currentQ + 1}`,
            18000
          );
        }
      }
    }, 500);

    return () => {
      clearInterval(detectInterval);
      if (alertTimeout) clearTimeout(alertTimeout);
      prevFrameRef.current = null;
      setCameraAlert(false);
      setCameraCautionText("Monitoring environment");
    };
  }, [phase, currentQ]);

  const startTest = async () => {
    try {
      // CRITICAL: call getUserMedia directly in click handler chain
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: cleanAudioConstraints,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => undefined);
      }

      // Prompt screen share BEFORE fullscreen
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && application) {
          screenRecorderRef.current = await startScreenRecording(session.user.id, application.id);
          setScreenStream(screenRecorderRef.current.stream);
        }
      } catch (e) {
        toast({ title: "Screen share required", description: "Please share your entire screen to continue the test.", variant: "destructive" });
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Request fullscreen after media starts
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        console.warn("Fullscreen not supported");
      }

      // Setup audio analyser for sound detection
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      // Extra listeners (window blur, fullscreen exit, escape)
      extraListenersStopRef.current = attachViolationListeners((type, desc) => {
        recordViolation(type, desc);
      });

      // Face/phone/multi-face guard
      if (videoRef.current) {
        startFaceGuard(videoRef.current, (type, desc) => {
          recordViolation(type, desc);
          toast({ title: `⚠️ ${type.replace(/_/g, " ")}`, description: desc, variant: "destructive" });
        }).then((stop) => { faceGuardStopRef.current = stop; });
      }
    } catch (e) {
      toast({ title: "Camera & Mic Required", description: "Please enable camera and microphone to take the test.", variant: "destructive" });
      return;
    }

    setPhase("test");
    setQuestionStartTime(Date.now());
  };

  const selectAnswer = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = optionIndex;
    setAnswers(newAnswers);
  };

  const goToQuestion = (idx: number) => {
    // Record time spent on current question
    const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
    const newTimes = [...timePerQuestion];
    newTimes[currentQ] += elapsed;
    setTimePerQuestion(newTimes);

    // Check if answered too fast (< 3 seconds)
    if (elapsed < 3 && answers[currentQ] !== null) {
      recordViolation("too_fast", `Question ${currentQ + 1} answered in ${elapsed} seconds`);
    }

    setCurrentQ(idx);
    setQuestionStartTime(Date.now());
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    // Record last question time
    const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
    const finalTimes = [...timePerQuestion];
    finalTimes[currentQ] += elapsed;

    // Submit via edge function (candidates cannot write scores directly — RLS trigger blocks it)
    const { data: result, error: submitErr } = await supabase.functions.invoke("submit-aptitude-test", {
      body: {
        applicationId: application.id,
        answers,
        timings: finalTimes,
      },
    });

    if (submitErr || (result && result.error)) {
      const msg = (submitErr as any)?.message || result?.error || "Submission failed";
      if (msg === "already_submitted") {
        setPhase("submitted");
        setSubmitting(false);
        return;
      }
      toast({ title: "Submit failed", description: String(msg), variant: "destructive" });
      setSubmitting(false);
      return;
    }


    // Exit fullscreen
    try { await document.exitFullscreen(); } catch (e) {}

    // Stop webcam & audio
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();

    // Detach proctoring listeners & guards, stop screen recording
    extraListenersStopRef.current?.();
    faceGuardStopRef.current?.();
    try {
      const path = await screenRecorderRef.current?.stop();
      if (path && application) {
        await supabase.from("applications").update({ aptitude_screen_recording_url: path } as any).eq("id", application.id);
      }
    } catch (e) { console.error("screen rec stop failed", e); }

    setPhase("submitted");
    setSubmitting(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
        <Shield className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Test Not Available</h1>
        <p className="text-muted-foreground text-center max-w-md">
          {accessMessage}
        </p>
        <Button onClick={() => navigate("/candidate-dashboard")} variant="outline" className="mt-6">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (phase === "submitted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mb-6">
          <CheckCircle className="h-20 w-20 text-primary" />
        </motion.div>
        <h1 className="text-2xl font-bold text-foreground mb-2">✅ Test Submitted Successfully!</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your aptitude test has been submitted. HR will review your results. You will receive a notification about the next steps.
        </p>
        <Button onClick={() => navigate("/candidate-dashboard")} className="mt-6">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (phase === "rules") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg w-full rounded-2xl border border-border bg-card p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">{roundLabel} Rules</h1>
          </div>

          <div className="space-y-3 mb-8">
            {[
              `${questions.length} questions total`,
              `${testMinutes} minutes time limit`,
              ...(passCutoff != null ? [`Passing cutoff: ${passCutoff}%`] : []),
              "Camera must stay ON throughout the test",

              "Do not switch tabs — violations are reported to HR",
              "Do not copy or paste — it will be blocked",
              "Stay in fullscreen mode",
              "Right-click is disabled",
              "All violations will be reported to HR in real-time",
              "3 or more violations may result in test cancellation",
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{rule}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              id="agree"
            />
            <label htmlFor="agree" className="text-sm text-foreground cursor-pointer">
              I agree to all the rules and understand that violations will be reported.
            </label>
          </div>

          <Button
            onClick={startTest}
            disabled={!agreed}
            className="w-full bg-primary text-primary-foreground"
            size="lg"
          >
            <Camera className="h-4 w-4 mr-2" />
            Start Test
          </Button>
        </motion.div>
      </div>
    );
  }

  // Test phase
  const question = questions[currentQ];
  const totalQ = questions.length;
  const progress = ((currentQ + 1) / totalQ) * 100;

  if (!question) return null;

  return (
    <div className="min-h-screen bg-background select-none">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-card border-b border-border px-6 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-foreground">
              Question {currentQ + 1} of {totalQ}
            </span>
            <span className="text-xs text-muted-foreground">
              {question.section}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {violations > 0 && (
              <span className="text-xs text-destructive font-medium">
                ⚠️ {violations} violation{violations > 1 ? "s" : ""}
              </span>
            )}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${timeLeft < 300 ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}>
              <Clock className="h-4 w-4" />
              <span className="font-mono font-bold text-sm">{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="max-w-4xl mx-auto mt-2">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question content */}
      <div className="max-w-3xl mx-auto p-8">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-foreground mb-6">
            {question.question}
          </h2>

          <div className="space-y-3">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => selectAnswer(i)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  answers[currentQ] === i
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    answers[currentQ] === i
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => goToQuestion(currentQ - 1)}
            disabled={currentQ === 0}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {currentQ < totalQ - 1 ? (
              <Button
                onClick={() => goToQuestion(currentQ + 1)}
                className="bg-primary text-primary-foreground"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-primary text-primary-foreground"
              >
                {submitting ? "Submitting..." : "Submit Test"}
              </Button>
            )}
          </div>
        </div>

        {/* Question navigator */}
        <div className="mt-8 p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-3">Question Navigator</p>
          <div className="grid grid-cols-10 gap-2">
            {Array.from({ length: totalQ }, (_, i) => (
              <button
                key={i}
                onClick={() => goToQuestion(i)}
                className={`h-8 w-8 rounded-lg text-xs font-medium transition-all ${
                  i === currentQ
                    ? "bg-primary text-primary-foreground"
                    : answers[i] !== null
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScreenSharePreview stream={screenStream} applicationId={application?.id} stage="aptitude_test" />

      {/* Hidden webcam feed used only for proctoring analysis */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="fixed -left-[9999px] -top-[9999px] h-px w-px opacity-0 pointer-events-none"
      />

      {/* Candidate-facing caution status (no live camera shown) */}
      <div className="fixed bottom-4 right-4 z-50">
        <div
          className={`rounded-xl border px-4 py-2 shadow-xl transition-all duration-300 ${
            cameraAlert
              ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          <p className="text-xs font-medium">
            {cameraAlert ? `⚠️ ${cameraCautionText}` : "🛡️ Proctoring active"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AptitudeTest;
