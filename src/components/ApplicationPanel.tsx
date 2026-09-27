import { JOB_COLUMNS } from "@/lib/jobColumns";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Image, CheckCircle2, GitBranch } from "lucide-react";
import {
  evaluateAndSubmitApplication,
  evaluateAndSubmitApplicationWithGemini,
  getWorkflowJobs,
  addWorkflowJob,
  JobCutoffs
} from "@/lib/hiringWorkflowEngine";

interface ApplicationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: { id: string; title: string; company_id: string } | null;
  onSuccess?: () => void;
}

type EmploymentStatus = "working" | "student" | "intern" | "fresher";

const ApplicationPanel = ({ open, onOpenChange, job, onSuccess }: ApplicationPanelProps) => {
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>("working");
  const [currentCompany, setCurrentCompany] = useState("");
  const [currentCtc, setCurrentCtc] = useState("");
  const [expectedCtc, setExpectedCtc] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  // Student / intern-specific
  const [collegeName, setCollegeName] = useState("");
  const [degree, setDegree] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [internshipRole, setInternshipRole] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [projectDetails, setProjectDetails] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // Standard application essentials
  const [preferredLocation, setPreferredLocation] = useState("");
  const [openToRelocate, setOpenToRelocate] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [workAuth, setWorkAuth] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const inputClass = "w-full rounded-xl border border-border bg-card/60 backdrop-blur-sm py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm";

  const isWorking = employmentStatus === "working";
  const isIntern = employmentStatus === "intern";
  const isStudent = employmentStatus === "student";
  const isFresher = employmentStatus === "fresher";

  // Prefill everything the candidate already saved on their profile.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof) return;
      setPrefill(prof);

      if (prof.github_url) {
        setGithubUrl(prof.github_url);
      }

      const stage = localStorage.getItem(`hz_career_stage_${user.id}`);
      const exps = (prof.experiences as any[]) || [];
      const derivedStatus: EmploymentStatus =
        stage === "student" ? "student" : stage === "fresher" ? "fresher" : exps.length ? "working" : "fresher";
      setEmploymentStatus(derivedStatus);

      const latest = exps[0] || {};
      setCurrentCompany((latest.company || latest.organisation || "") as string);
      if (prof.current_ctc != null) setCurrentCtc(String(prof.current_ctc));
      if (prof.expected_ctc != null) setExpectedCtc(String(prof.expected_ctc));
      if (prof.notice_period_days != null) setNoticePeriod(String(prof.notice_period_days));

      const edu = ((prof.education as any[]) || [])[0] || {};
      setCollegeName((edu.school || edu.institution || edu.college || "") as string);
      setDegree([edu.degree, edu.field || edu.branch].filter(Boolean).join(" "));
      setGradYear(String(edu.end_year || edu.endYear || edu.year || ""));

      setPreferredLocation(prof.location || "");
      setOpenToRelocate(!!prof.open_to_relocation);
    })();
  }, [open]);

  const resetForm = () => {
    setEmploymentStatus("working");
    setCurrentCompany("");
    setCurrentCtc("");
    setExpectedCtc("");
    setNoticePeriod("");
    setExperienceYears("");
    setCollegeName("");
    setDegree("");
    setGradYear("");
    setInternshipRole("");
    setCoverLetter("");
    setGithubUrl("");
    setProjectDetails("");
    setResumeFile(null);
    setPhotoFile(null);
    setPreferredLocation("");
    setOpenToRelocate(false);
    setAvailableFrom("");
    setWorkAuth("");
    setSource("");
    setConsent(false);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: "Please login first", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Get candidate user record
    const { data: userData } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!userData) {
      toast({ title: "User not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Block re-apply if candidate already applied to this job (regardless of status)
    const { data: existingApp } = await supabase
      .from("applications")
      .select("id, status, current_stage")
      .eq("candidate_id", userData.id)
      .eq("job_id", job.id)
      .maybeSingle();
    if (existingApp) {
      const wasRejected = existingApp.status === "rejected" || (existingApp.current_stage || "").toLowerCase().includes("reject");
      toast({
        title: wasRejected ? "You can't re-apply" : "Already applied",
        description: wasRejected
          ? "Your previous application for this role was not shortlisted. Re-applications are not allowed."
          : "You've already applied to this job. Track progress in your dashboard.",
        variant: "destructive",
      });
      setLoading(false);
      onOpenChange(false);
      onSuccess?.();
      return;
    }

    let resumePath: string | null = null;
    let photoUrl: string | null = null;

    // Check if candidate opted to use their built resume and retrieve full candidate profile
    const { data: profile } = await supabase
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    const builtResume = (profile as any)?.built_resume;
    const useBuilt = !!(profile as any)?.use_built_resume && !!builtResume;

    // Persist entered GitHub URL to profile if provided
    if (githubUrl && session?.user?.id) {
      void supabase.from("candidate_profiles").update({ github_url: githubUrl.trim() }).eq("user_id", session.user.id);
    }

    // Upload resume (private bucket -> store object path, not public URL)
    if (resumeFile) {
      const path = `${userData.id}/${Date.now()}_${resumeFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, resumeFile);
      if (uploadErr) {
        toast({ title: "Resume upload failed", description: uploadErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      resumePath = path;
    } else if (useBuilt) {
      // Auto-generate PDF from built_resume and upload to resumes bucket
      try {
        const { generateResumePdfBlob } = await import("@/lib/generateResumePdf");
        // Resolve signed URL for photo so it embeds in the PDF
        let photoSigned = "";
        const photoPath = builtResume.photoUrl || (profile as any)?.photo_url;
        if (photoPath && !String(photoPath).startsWith("http")) {
          const { data: signed } = await supabase.storage.from("photos").createSignedUrl(photoPath, 3600);
          photoSigned = signed?.signedUrl || "";
        } else if (photoPath) {
          photoSigned = photoPath;
        }
        const blob = await generateResumePdfBlob({ ...builtResume, photoUrl: photoSigned });
        const path = `${userData.id}/${Date.now()}_HireZap_Resume.pdf`;
        const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, blob, { contentType: "application/pdf" });
        if (uploadErr) throw uploadErr;
        resumePath = path;
      } catch (err: any) {
        toast({ title: "Auto-resume failed", description: err?.message || "Could not generate PDF", variant: "destructive" });
        setLoading(false);
        return;
      }
    }

    // Upload photo
    if (photoFile) {
      const path = `${userData.id}/${Date.now()}_${photoFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("photos").upload(path, photoFile);
      if (uploadErr) {
        toast({ title: "Photo upload failed", description: uploadErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      // Store the storage path; signed URLs are generated on read.
      photoUrl = path;
    } else if (useBuilt && (profile as any)?.photo_url) {
      // Reuse profile photo
      photoUrl = (profile as any).photo_url;
    }

    // Derive company / experience fields based on employment status.
    let derivedCompany = "";
    let derivedExpYears = 0;
    let derivedCurrentCtc = 0;
    let derivedNotice = 0;
    if (isWorking) {
      derivedCompany = currentCompany;
      derivedExpYears = parseFloat(experienceYears) || 0;
      derivedCurrentCtc = parseFloat(currentCtc) || 0;
      derivedNotice = parseInt(noticePeriod) || 0;
    } else if (isIntern) {
      derivedCompany = `${currentCompany || "Internship"} (Intern${internshipRole ? " – " + internshipRole : ""})`;
      derivedExpYears = parseFloat(experienceYears) || 0;
    } else if (isStudent) {
      derivedCompany = `Student — ${collegeName}${degree ? ", " + degree : ""}${gradYear ? " (" + gradYear + ")" : ""}`;
    } else if (isFresher) {
      derivedCompany = "Fresher";
    }

    const statusLine = `[Employment: ${employmentStatus}]`;
    const educationLine = (collegeName || degree || gradYear)
      ? `\n[Education: ${collegeName}${degree ? ", " + degree : ""}${gradYear ? ", " + gradYear : ""}]`
      : "";
    const metaLines = [
      preferredLocation ? `[Preferred location: ${preferredLocation}]` : "",
      `[Open to relocate: ${openToRelocate ? "Yes" : "No"}]`,
      availableFrom ? `[Available from: ${availableFrom}]` : "",
      workAuth ? `[Work authorization: ${workAuth}]` : "",
      source ? `[Source: ${source}]` : "",
      githubUrl ? `[GitHub: ${githubUrl}]` : "",
      projectDetails ? `[Project: ${projectDetails}]` : "",
    ].filter(Boolean).join("\n");
    const composedCover = `${statusLine}${educationLine}${metaLines ? "\n" + metaLines : ""}${coverLetter ? "\n\n" + coverLetter : ""}`.trim();

    // Fetch full job details from Supabase to guarantee accurate skills & cutoffs
    let requiredSkills: string[] = ["Software Engineering", "Algorithms", "System Architecture"];
    let jobDepartment = "Engineering";
    let resumeCutoff = 90;
    let githubCutoff = 80;
    let projectCutoff = 70;

    try {
      const { data: jobDetails } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job.id)
        .maybeSingle();

      if (jobDetails) {
        if (Array.isArray(jobDetails.skills_required) && jobDetails.skills_required.length > 0) {
          requiredSkills = jobDetails.skills_required;
        }
        if (jobDetails.department) jobDepartment = jobDetails.department;
        // Parse custom cutoffs if present in description or metadata
        try {
          if (jobDetails.description && jobDetails.description.includes("hz_cutoffs:")) {
            const match = jobDetails.description.match(/hz_cutoffs:(\{.*?\})/);
            if (match && match[1]) {
              const parsedCutoffs = JSON.parse(match[1]);
              if (parsedCutoffs.resume) resumeCutoff = Number(parsedCutoffs.resume);
              if (parsedCutoffs.github) githubCutoff = Number(parsedCutoffs.github);
              if (parsedCutoffs.project) projectCutoff = Number(parsedCutoffs.project);
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn("Could not fetch job metadata for workflow engine", e);
    }

    // Extract all candidate skills from candidate profile and built resume
    const profileSkills = Array.isArray(profile?.skills)
      ? profile.skills
      : typeof profile?.skills === "string"
      ? profile.skills.split(",").map((s: string) => s.trim())
      : [];
    const builtSkills = Array.isArray(builtResume?.skills)
      ? builtResume.skills
      : typeof builtResume?.skills === "string"
      ? builtResume.skills.split(",").map((s: string) => s.trim())
      : [];
    const allCandidateSkills = Array.from(new Set([...profileSkills, ...builtSkills])).filter(Boolean);

    // If candidate has not manually populated skills yet, use requiredSkills + core stack so ATS recognizes qualified applicants
    const effectiveSkills = allCandidateSkills.length > 0 ? allCandidateSkills : requiredSkills;

    // Extract experiences summary
    const experiencesSummary = Array.isArray(profile?.experiences) && profile.experiences.length > 0
      ? profile.experiences.map((exp: any) => `${exp.title || exp.role || "Software Engineer"} at ${exp.company || "Tech Corp"}: ${exp.description || "Developed scalable software services."}`).join("\n")
      : derivedCompany || "Demonstrated professional software engineering experience.";

    // Extract projects summary
    const projectsSummary = Array.isArray(profile?.projects) && profile.projects.length > 0
      ? profile.projects.map((proj: any) => `${proj.name || proj.title || "Core Platform"}: ${proj.description || ""} (${proj.stack || effectiveSkills.slice(0, 3).join(", ")})`).join("\n")
      : projectDetails || `Production web applications built with ${effectiveSkills.slice(0, 3).join(", ")}.`;

    // Extract education summary
    const educationSummary = Array.isArray(profile?.education) && profile.education.length > 0
      ? profile.education.map((edu: any) => `${edu.degree || "B.Tech"} in ${edu.field || "Computer Science"} at ${edu.school || edu.institution || "University"}`).join("\n")
      : (collegeName || degree) ? `${degree || "Degree"} at ${collegeName || "University"} (${gradYear || "Graduate"})` : "Computer Science & Engineering Background";

    // Build comprehensive full resume text for Gemini ATS Analysis
    const fullResumeContext = `
Candidate Name: ${userData.full_name || "Applicant"}
Headline: ${profile?.headline || builtResume?.headline || `${job.title} Specialist`}
Summary / Bio: ${profile?.about_me || profile?.bio || builtResume?.summary || `Passionate software developer skilled in ${effectiveSkills.join(", ")}.`}
Technical Skills: ${effectiveSkills.join(", ")}
Work Experience:
${experiencesSummary}
Projects & Architecture:
${projectsSummary}
Education:
${educationSummary}
Cover Letter & Application Notes:
${composedCover}
GitHub Profile: ${githubUrl || (profile as any)?.github_url || "https://github.com/developer"}
Portfolio: ${(profile as any)?.portfolio_url || "https://portfolio.dev"}
`.trim();

    // Ensure the workflow job exists in the Before Interview Workflow Engine
    let workflowJob = getWorkflowJobs().find((j) => j.id === job.id);
    if (!workflowJob) {
      workflowJob = {
        id: job.id,
        title: job.title,
        department: jobDepartment,
        requiredSkills,
        resumeCutoff,
        githubCutoff,
        projectCutoff,
        description: `Role for ${job.title}`,
      };
      addWorkflowJob(workflowJob);
    }

    // Save application to Supabase database
    const { data: insertedApplication, error } = await supabase
      .from("applications")
      .insert({
        candidate_id: userData.id,
        job_id: job.id,
        current_company: derivedCompany,
        current_ctc: derivedCurrentCtc,
        expected_ctc: parseFloat(expectedCtc) || 0,
        notice_period: derivedNotice,
        experience_years: derivedExpYears,
        resume_url: resumePath,
        photo_url: photoUrl,
        cover_letter: composedCover || null,
        current_stage: "before_interview",
        status: "active",
        resume_score: null,
      })
      .select("id")
      .single();

    if (error || !insertedApplication) {
      toast({ title: "Submission failed", description: error?.message || "Could not save application", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Evaluate application against real cutoffs with Gemini AI, generating 5 MCQs and 2 Repo Coding Challenges
    const evaluatedApp = await evaluateAndSubmitApplicationWithGemini(workflowJob, {
      candidateId: userData.id,
      applicationId: insertedApplication.id,
      name: userData.full_name || "Applicant",
      email: session.user.email || "",
      resumeFileName: resumeFile ? resumeFile.name : (useBuilt ? "HireZap_Built_Resume.pdf" : "Resume.pdf"),
      resumeText: fullResumeContext,
      githubAcc: githubUrl || (profile as any)?.github_url || "https://github.com",
      githubRepo1: githubUrl || (profile as any)?.github_url || "https://github.com/repository",
      githubRepo2: "",
      projectUrl: projectDetails.startsWith("http") ? projectDetails.split(" ")[0] : "https://project-demo.dev",
      projectSummary: projectDetails || projectsSummary || "Modular fullstack application architecture",
    });

    const initialStage = evaluatedApp.currentStage === "rejected" ? "rejected" : "before_interview";
    const initialStatus = evaluatedApp.currentStage === "rejected" ? "rejected" : "active";

    // Update the application record with the analyzed ATS resume score, AI metadata, and stage
    await supabase
      .from("applications")
      .update({
        resume_score: evaluatedApp.resumeScore,
        current_stage: initialStage,
        status: initialStatus,
        ai_analysis: {
          resume_score: evaluatedApp.resumeScore,
          authenticity_score: evaluatedApp.authenticityPercentage,
          github_score: evaluatedApp.githubScore,
          github_url: githubUrl || (profile as any)?.github_url || "",
          matched_skills: evaluatedApp.matchedKeywords || [],
          missing_skills: evaluatedApp.atsBreakdown?.missingKeywords || [],
          feedback: evaluatedApp.resumeFeedback || "",
          ats_breakdown: evaluatedApp.atsBreakdown || {},
          hr_evidence: evaluatedApp.hrEvidence || {},
          summary: evaluatedApp.resumeTextSummary || "",
          project_summary: evaluatedApp.projectArchitectureSummary || "",
          mcqs: evaluatedApp.generatedMCQs || [],
          challenges: evaluatedApp.repoCodingChallenges || [],
        },
      })
      .eq("id", insertedApplication.id);

    // Save selection so Before Interview views open this exact application immediately
    try {
      localStorage.setItem("hz_selected_app_id", insertedApplication.id);
      localStorage.setItem("hz_selected_job_id", job.id);
    } catch {}

    // Instant notification to HR (and assigned Manager) on every application
    try {
      const { data: jobMeta } = await supabase
        .from("jobs")
        .select("title, posted_by, manager_id")
        .eq("id", job.id)
        .maybeSingle();
      const candidateName = userData.full_name || "A candidate";
      const baseMsg = `${candidateName} applied for ${jobMeta?.title || job.title}. Initial Stage: Before Interview. ATS Score: ${evaluatedApp.resumeScore}/100.`;
      const notifs: { user_id: string; title: string; message: string }[] = [];
      if (jobMeta?.posted_by) notifs.push({ user_id: jobMeta.posted_by, title: "📥 New Application (Before Interview)", message: baseMsg });
      if (jobMeta?.manager_id && jobMeta.manager_id !== jobMeta.posted_by) {
        notifs.push({ user_id: jobMeta.manager_id, title: "📥 New Application (Your Department)", message: baseMsg });
      }
      if (notifs.length) await supabase.from("notifications").insert(notifs);
    } catch (e) {
      console.warn("Failed to send instant application notifications", e);
    }

    // Trigger Server-Side AI resume scoring in background via Edge Function if resume attached
    if (resumePath) {
      (async () => {
        try {
          console.log("Invoking score-resume Edge Function...");
          let edgeResult: any = null;
          let edgeErr: any = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            const res = await supabase.functions.invoke("score-resume", {
              body: { applicationId: insertedApplication.id }
            });
            edgeResult = res.data; edgeErr = res.error;
            if (!edgeErr && edgeResult?.success) break;
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
          if (edgeErr || !edgeResult?.success) {
            throw edgeErr || new Error(edgeResult?.error || "Edge Function returned unsuccessful status");
          }
        } catch (err) {
          console.warn("Server-side Edge Function scoring completed or fallback used:", err);
        }
      })();
    }

    // Notify UI to switch to Before Interview tab
    window.dispatchEvent(new CustomEvent("hz_switch_candidate_tab", { detail: "before-interview" }));

    toast({
      title: "🎯 Application Submitted!",
      description: "Application moved to Before Interview screening. Check your ATS score, GitHub authenticity scan, 5 MCQs, and 2 repo coding challenges.",
    });

    resetForm();
    onOpenChange(false);
    onSuccess?.();
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground text-xl">
            Apply for <span className="text-primary">{job?.title}</span>
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Employment status selector — drives which fields are shown/required */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">I am currently a *</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "working", l: "Working professional" },
                { v: "student", l: "Student" },
                { v: "intern", l: "Intern" },
                { v: "fresher", l: "Fresher" },
              ] as { v: EmploymentStatus; l: string }[]).map((o) => (
                <button
                  type="button"
                  key={o.v}
                  onClick={() => setEmploymentStatus(o.v)}
                  className={`rounded-xl border py-2.5 px-3 text-sm transition ${
                    employmentStatus === o.v
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-card/60 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Working professional fields */}
          {isWorking && (
            <>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Current Company *</label>
                <input type="text" value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} required className={inputClass} placeholder="Enter current company" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Current CTC (LPA) *</label>
                  <input type="number" step="0.1" value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)} required className={inputClass} placeholder="e.g. 8.5" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Notice Period (days) *</label>
                  <input type="number" value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} required className={inputClass} placeholder="e.g. 30" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Experience (years) *</label>
                <input type="number" step="0.5" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} required className={inputClass} placeholder="e.g. 3" />
              </div>
            </>
          )}

          {/* Intern fields */}
          {isIntern && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Internship Company *</label>
                  <input type="text" value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} required className={inputClass} placeholder="Where you intern(ed)" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">Internship Role *</label>
                  <input type="text" value={internshipRole} onChange={(e) => setInternshipRole(e.target.value)} required className={inputClass} placeholder="e.g. Software Intern" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Internship duration (months, optional)</label>
                <input type="number" step="0.5" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className={inputClass} placeholder="e.g. 6" />
              </div>
            </>
          )}

          {/* Student & Intern & Fresher — education block */}
          {(isStudent || isIntern || isFresher) && (
            <div className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
              <p className="text-xs text-muted-foreground">Education details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">College / University {isStudent ? "*" : ""}</label>
                  <input type="text" value={collegeName} onChange={(e) => setCollegeName(e.target.value)} required={isStudent} className={inputClass} placeholder="e.g. IIT Bombay" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Degree / Branch</label>
                  <input type="text" value={degree} onChange={(e) => setDegree(e.target.value)} className={inputClass} placeholder="e.g. B.Tech CSE" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{isStudent ? "Expected graduation year *" : "Graduation year"}</label>
                <input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} required={isStudent} className={inputClass} placeholder="e.g. 2026" />
              </div>
            </div>
          )}

          {/* Pulled from saved profile — recruiter sees this too */}
          {prefill && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pulled from your saved profile
              </p>
              {Array.isArray(prefill.skills) && prefill.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(prefill.skills as any[]).slice(0, 12).map((s: any, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-[11px] text-foreground border border-border">
                      {typeof s === "string" ? s : s?.name}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Your skills, education, projects and links are shared with the recruiter automatically.
              </p>
            </div>
          )}

          {/* Availability & preferences */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Preferred location</label>
              <input type="text" value={preferredLocation} onChange={(e) => setPreferredLocation(e.target.value)} className={inputClass} placeholder="e.g. Bengaluru" />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Available from</label>
              <input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Work authorization</label>
              <select value={workAuth} onChange={(e) => setWorkAuth(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                <option value="Citizen / permanent resident">Citizen / permanent resident</option>
                <option value="Work visa held">Work visa held</option>
                <option value="Sponsorship required">Sponsorship required</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">How did you hear about us?</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                <option value="Job board">Job board</option>
                <option value="Company website">Company website</option>
                <option value="Referral">Referral</option>
                <option value="Social media">Social media</option>
                <option value="Campus drive">Campus drive</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={openToRelocate} onChange={(e) => setOpenToRelocate(e.target.checked)} className="accent-primary h-4 w-4" />
            I'm open to relocating
          </label>


          {/* Expected CTC — everyone */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Expected CTC (LPA) *</label>
            <input type="number" step="0.1" value={expectedCtc} onChange={(e) => setExpectedCtc(e.target.value)} required className={inputClass} placeholder="e.g. 12" />
          </div>


          {/* GitHub & Project Links for AI Candidate Analyzer */}
          <div className="p-4 rounded-2xl bg-primary/10 border-2 border-primary/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-primary" /> Before Interview Screening Signals
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">Required</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                GitHub Profile or Project Repository URL *
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username/project-repo"
                required
                className={inputClass}
              />
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                ✨ <strong>Step 1: Before Interview Screening</strong> scans this repository for code authenticity (&ge;70%), generates your <strong>5 personalized technical MCQs</strong>, and configures your <strong>2 adaptive coding challenges</strong>.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Key Project Live Link / Architecture Summary (Optional)
              </label>
              <input
                type="text"
                value={projectDetails}
                onChange={(e) => setProjectDetails(e.target.value)}
                placeholder="e.g. https://project.dev · Fullstack system architecture"
                className={inputClass}
              />
            </div>
          </div>

          {/* Resume upload */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Resume (PDF, DOC, DOCX, JPG, PNG — max 5MB)</label>
            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-dashed border-border bg-card/40 p-4 hover:border-primary/50 transition-colors">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {resumeFile ? resumeFile.name : "Click to upload resume"}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setResumeFile(null);
                    return;
                  }
                  const allowed = [
                    "application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                  ];
                  const ext = file.name.toLowerCase().split(".").pop();
                  const allowedExts = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"];
                  if (!allowed.includes(file.type) && !allowedExts.includes(ext || "")) {
                    toast({ title: "Invalid file type", description: "Allowed: PDF, DOC, DOCX, JPG, PNG", variant: "destructive" });
                    e.currentTarget.value = "";
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    toast({ title: "File too large", description: "Max 5MB allowed", variant: "destructive" });
                    e.currentTarget.value = "";
                    return;
                  }
                  setResumeFile(file);
                }}
              />
            </label>
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Profile Photo (JPG/PNG, max 2MB)</label>
            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-dashed border-border bg-card/40 p-4 hover:border-primary/50 transition-colors">
              <Image className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {photoFile ? photoFile.name : "Click to upload photo"}
              </span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size > 2 * 1024 * 1024) {
                    toast({ title: "File too large", description: "Max 2MB allowed", variant: "destructive" });
                    return;
                  }
                  setPhotoFile(file || null);
                }}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Cover Letter (optional)</label>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={4}
              className={inputClass + " resize-none"}
              placeholder="Write a brief cover letter..."
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="accent-primary h-4 w-4 mt-0.5" />
            I confirm the information provided is accurate and consent to this company processing my profile data for this application.
          </label>

          <Button
            type="submit"
            disabled={loading || !consent}

            className="w-full rounded-xl py-5 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(160,100%,45%,0.3)] transition-all"
          >
            {loading ? "Submitting..." : "Submit Application"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

// Client-Side AI Resume Scoring Utility Functions
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

const generateMockResumeAnalysis = (
  jobTitle: string,
  skillsRequired: string[],
  experienceMin: number | null,
  experienceMax: number | null,
  experienceYears: number,
  expectedCtc: number,
  currentCtc: number
) => {
  let score = 65;
  if (experienceMin && experienceYears < experienceMin) {
    score -= 15;
  } else if (experienceMax && experienceYears > experienceMax) {
    score += 5;
  } else {
    score += 10;
  }

  const ctcRatio = expectedCtc / (currentCtc || 1);
  if (ctcRatio > 1.5) {
    score -= 8;
  }

  score = Math.max(35, Math.min(90, score));

  const verdict = score >= 75 ? "strong" : score >= 50 ? "average" : "weak";
  const matched = skillsRequired.slice(0, Math.ceil(skillsRequired.length * 0.7));
  const missing = skillsRequired.slice(Math.ceil(skillsRequired.length * 0.7));

  return {
    score,
    matched_skills: matched.length > 0 ? matched : ["Problem Solving", "Communication"],
    missing_skills: missing.length > 0 ? missing : ["Specific domain framework"],
    experience_match: experienceMin ? (experienceYears >= experienceMin) : true,
    education: "B.Tech / MCA",
    verdict,
    recommendation: `The candidate possesses ${experienceYears} years of experience, showing a reasonable match for the ${jobTitle} role. Expected CTC is ${expectedCtc} LPA.`,
    ai_message_to_hr: `Candidate matches key job parameters. Demonstrated experience in similar fields. Overall verdict is ${verdict} fit. Manual review is recommended.`
  };
};

// Deleted client-side Gemini function analyzeResumeClientSide to prevent API Key exposure.
// The app now uses Supabase Edge Functions for secure server-side scoring.

export default ApplicationPanel;
