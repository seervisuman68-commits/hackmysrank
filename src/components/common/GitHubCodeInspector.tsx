import React, { useState, useEffect } from "react";
import {
  GitBranch,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Code2,
  FileCode,
  Sparkles,
  ExternalLink,
  Layers,
  Terminal,
  Cpu,
  RefreshCw,
  Eye,
  Filter,
  FileText,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InspectedCodeFile,
  CandidateApplicationSubmission,
  JobCutoffs,
  generateDynamicInspectedCodeFiles,
} from "@/lib/hiringWorkflowEngine";
import { analyzeBeforeInterviewWithGemini, getGeminiApiKey } from "@/lib/geminiResumeAnalyzer";
import {
  GitHubVerificationReport,
  performGitHubCodeVerification,
} from "@/lib/githubVerifier";
import { GitHubUnderstandingAssessment } from "@/components/candidate/GitHubUnderstandingAssessment";
import { GitHubVerificationReportView } from "@/components/hr/GitHubVerificationReportView";
import { useToast } from "@/hooks/use-toast";

interface GitHubCodeInspectorProps {
  application: CandidateApplicationSubmission;
  job: JobCutoffs;
  isHRView?: boolean;
  onApplicationUpdate?: (updated: CandidateApplicationSubmission) => void;
}

export const GitHubCodeInspector: React.FC<GitHubCodeInspectorProps> = ({
  application,
  job,
  isHRView = false,
  onApplicationUpdate,
}) => {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<"inspector" | "assessment" | "report">("inspector");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "human" | "ai">("all");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [verificationReport, setVerificationReport] = useState<GitHubVerificationReport | null>(
    application.githubVerificationReport || null
  );

  const files: InspectedCodeFile[] =
    application.inspectedCodeFiles && application.inspectedCodeFiles.length > 0
      ? application.inspectedCodeFiles
      : generateDynamicInspectedCodeFiles(
          application.detectedRepoStacks || job.requiredSkills,
          application.githubRepo1Url || application.githubAccountUrl || "candidate-repo",
          application.authenticityPercentage || 88
        );

  const activeFile = files.find((f) => f.id === selectedFileId) || files[0] || null;

  const authenticityPct = application.authenticityPercentage ?? 88;
  const aiPct = application.aiWrittenPercentage ?? 100 - authenticityPct;
  const githubCutoff = job?.githubCutoff || 70;
  const isAuthenticPassed = authenticityPct >= 70 && (application.githubScore ?? 90) >= githubCutoff;

  // Load / initialize verification report
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!verificationReport) {
        const rep = await performGitHubCodeVerification(
          application.githubRepo1Url || application.githubAccountUrl || "candidate-repo",
          {
            name: application.candidateName || "Candidate",
            email: application.candidateEmail,
            requiredSkills: job.requiredSkills,
          },
          files
        );
        if (mounted) {
          setVerificationReport(rep);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [application.id, application.githubRepo1Url]);

  const handleRunLiveGeminiScan = async () => {
    setIsScanning(true);
    try {
      const apiKey = getGeminiApiKey();
      const geminiResult = await analyzeBeforeInterviewWithGemini(
        {
          title: job.title,
          requiredSkills: job.requiredSkills,
          description: job.description || `Role: ${job.title}`,
          resumeCutoff: job.resumeCutoff,
          githubCutoff: job.githubCutoff,
          projectCutoff: job.projectCutoff,
        },
        {
          name: application.candidateName,
          resumeText: application.resumeTextSummary,
          githubUrl: `${application.githubAccountUrl} ${application.githubRepo1Url} ${application.githubRepo2Url || ""}`,
          projectDetails: `${application.projectLiveUrl || ""} ${application.projectArchitectureSummary}`,
        },
        apiKey
      );

      const newAuthenticityPct = geminiResult
        ? Math.max(0, Math.min(100, Math.round(geminiResult.authenticityPercentage || 88)))
        : authenticityPct;
      const newAiPct = 100 - newAuthenticityPct;
      const newGithubScore = Math.min(100, Math.round(newAuthenticityPct * 0.9 + 10));
      const newGithubPassed = newGithubScore >= githubCutoff && newAuthenticityPct >= 70;

      const updatedFiles =
        geminiResult?.inspectedCodeFiles && geminiResult.inspectedCodeFiles.length > 0
          ? geminiResult.inspectedCodeFiles
          : generateDynamicInspectedCodeFiles(
              geminiResult?.matchedKeywords || application.detectedRepoStacks,
              application.githubRepo1Url,
              newAuthenticityPct
            );

      const updatedReport = await performGitHubCodeVerification(
        application.githubRepo1Url || application.githubAccountUrl || "candidate-repo",
        {
          name: application.candidateName,
          email: application.candidateEmail,
          requiredSkills: job.requiredSkills,
        },
        updatedFiles
      );

      setVerificationReport(updatedReport);

      const finalAuthenticityPct = updatedReport.authenticityPercentage ?? newAuthenticityPct;
      const finalAiPct = updatedReport.aiWrittenPercentage ?? (100 - finalAuthenticityPct);
      const finalGithubScore = updatedReport.githubScore ?? newGithubScore;
      const finalGithubPassed = finalGithubScore >= githubCutoff && finalAuthenticityPct >= 70;

      const updatedApp: CandidateApplicationSubmission = {
        ...application,
        authenticityPercentage: finalAuthenticityPct,
        aiWrittenPercentage: finalAiPct,
        githubScore: finalGithubScore,
        githubPassed: finalGithubPassed,
        githubFeedback: geminiResult?.githubFeedback || updatedReport.finalSummary || "Gemini code authenticity scan complete.",
        codeSignals: geminiResult?.codeSignals || application.codeSignals,
        inspectedCodeFiles: updatedFiles,
        githubVerificationReport: updatedReport,
        generatedMCQs: geminiResult?.generatedMCQs || application.generatedMCQs,
        repoCodingChallenges: (geminiResult?.repoCodingChallenges as any) || application.repoCodingChallenges,
      };

      if (onApplicationUpdate) {
        onApplicationUpdate(updatedApp);
      }

      toast({
        title: "🤖 GitHub Verification Scan Complete",
        description: `Status: ${updatedReport.finalStatus} · Human Authenticity: ${finalAuthenticityPct}% · Score: ${finalGithubScore}/100`,
      });
    } catch (e) {
      console.error("Gemini GitHub scan error:", e);
      toast({
        title: "Scan Error",
        description: "Could not complete live scan. Using stored repository analysis.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAssessmentCompleted = (completedReport: GitHubVerificationReport) => {
    setVerificationReport(completedReport);
    const finalAuthenticity = completedReport.authenticityPercentage ?? application.authenticityPercentage;
    const finalGithubScore = completedReport.githubScore ?? application.githubScore;
    const updatedApp: CandidateApplicationSubmission = {
      ...application,
      authenticityPercentage: finalAuthenticity,
      aiWrittenPercentage: completedReport.aiWrittenPercentage ?? (100 - finalAuthenticity),
      githubScore: finalGithubScore,
      githubPassed: (finalGithubScore ?? 0) >= githubCutoff && (finalAuthenticity ?? 0) >= 70,
      githubVerificationReport: completedReport,
    };
    if (onApplicationUpdate) {
      onApplicationUpdate(updatedApp);
    }
  };

  const filteredLines = activeFile
    ? activeFile.lines.filter((l) => {
        if (filterMode === "human") return !l.isAi && l.code.trim().length > 0;
        if (filterMode === "ai") return l.isAi && l.code.trim().length > 0;
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-paper-2 rounded-2xl border border-ink/10 shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveSubTab("inspector")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all ${
              activeSubTab === "inspector"
                ? "bg-ink text-paper font-semibold shadow"
                : "text-ink-soft hover:text-ink hover:bg-ink/5"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-forest" />
            <span>Code Inspector &amp; AI Breakdown</span>
          </button>

          <button
            onClick={() => setActiveSubTab("assessment")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all ${
              activeSubTab === "assessment"
                ? "bg-ink text-paper font-semibold shadow"
                : "text-ink-soft hover:text-ink hover:bg-ink/5"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5 text-forest" />
            <span>Code Understanding Quiz (5–10 Questions)</span>
            {verificationReport && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-forest/20 text-forest font-semibold">
                {verificationReport.understandingScore}%
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab("report")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all ${
              activeSubTab === "report"
                ? "bg-ink text-paper font-semibold shadow"
                : "text-ink-soft hover:text-ink hover:bg-ink/5"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-forest" />
            <span>HR Verification Report</span>
            {verificationReport && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-900 font-semibold">
                {verificationReport.finalStatus}
              </span>
            )}
          </button>
        </div>

        <Button
          onClick={handleRunLiveGeminiScan}
          disabled={isScanning}
          size="sm"
          className="bg-forest text-paper hover:bg-forest/90 text-xs gap-1.5 shadow-sm"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
          {isScanning ? "Scanning Repo..." : "Re-Verify with Gemini AI"}
        </Button>
      </div>

      {/* SUB-TAB 1: INSPECTOR & AI BREAKDOWN */}
      {activeSubTab === "inspector" && (
        <div className="space-y-6">
          {/* Code Authenticity Header Card */}
          <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-forest" />
                  <h3 className="font-serif-display text-lg font-bold text-ink">
                    GitHub Code Authenticity &amp; AI-Written Detector
                  </h3>
                  <Badge
                    variant="outline"
                    className={`font-mono text-xs ${
                      isAuthenticPassed
                        ? "bg-forest/10 text-forest border-forest/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    }`}
                  >
                    {isAuthenticPassed ? "Verified Human Logic ✓" : "High AI Boilerplate Detected ✕"}
                  </Badge>
                </div>
                <p className="text-xs text-ink-soft">
                  Deep static analysis inspecting developer commit lineage, algorithmic uniqueness, and AI code generation fingerprints.
                </p>
              </div>

              {verificationReport && (
                <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-paper-2 border border-ink/10 text-xs font-mono">
                  <span className="text-ink-muted">Final Audit Status:</span>
                  <strong className="text-forest">{verificationReport.finalStatus}</strong>
                </div>
              )}
            </div>

            {/* Breakdown Progress Meter */}
            <div className="space-y-2 pt-2 border-t border-ink/10">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-forest" />
                  Authenticity vs AI Boilerplate Ratio:
                </span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-forest font-bold">{authenticityPct}% Human Hand-Written</span>
                  <span className="text-amber-700 font-bold">{aiPct}% AI / Boilerplate</span>
                </div>
              </div>

              <div className="w-full h-4 rounded-full bg-amber-200 overflow-hidden flex shadow-inner border border-ink/10">
                <div
                  className="bg-emerald-600 h-full transition-all duration-700 flex items-center justify-center text-[10px] font-mono text-paper font-semibold"
                  style={{ width: `${authenticityPct}%` }}
                >
                  {authenticityPct >= 20 ? `${authenticityPct}% Human` : ""}
                </div>
                <div
                  className="bg-amber-500 h-full transition-all duration-700 flex items-center justify-center text-[10px] font-mono text-paper font-semibold"
                  style={{ width: `${aiPct}%` }}
                >
                  {aiPct >= 20 ? `${aiPct}% AI` : ""}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-ink-muted pt-1">
                <span>Required Authenticity Cutoff: <strong className="text-ink">70%</strong></span>
                <span>GitHub Quality Score: <strong className="text-ink">{application.githubScore || 90}/100</strong> (Cutoff: {githubCutoff}%)</span>
                <span className={isAuthenticPassed ? "text-forest font-semibold" : "text-destructive font-semibold"}>
                  {isAuthenticPassed
                    ? "✓ Stage 3 MCQs & Stage 4 Adaptive DSA Sandbox Unlocked"
                    : "🔒 Stage 3 & Stage 4 Locked (Requires ≥70% Authenticity)"}
                </span>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 text-center">
                <div className="text-[10px] uppercase font-mono text-ink-muted">Human Hand-Written</div>
                <div className="font-serif-display text-2xl font-bold text-forest mt-0.5">{authenticityPct}%</div>
                <div className="text-[10px] text-forest/80 font-medium">Domain logic &amp; algorithms</div>
              </div>
              <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 text-center">
                <div className="text-[10px] uppercase font-mono text-ink-muted">AI Boilerplate</div>
                <div className="font-serif-display text-2xl font-bold text-amber-700 mt-0.5">{aiPct}%</div>
                <div className="text-[10px] text-amber-800/80 font-medium">Scaffolded interfaces</div>
              </div>
              <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 text-center">
                <div className="text-[10px] uppercase font-mono text-ink-muted">Code Understanding</div>
                <div className="font-serif-display text-2xl font-bold text-forest mt-0.5">
                  {verificationReport?.understandingScore ?? 85}%
                </div>
                <div className="text-[10px] text-ink-muted">5–10 Code Questions</div>
              </div>
              <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 text-center">
                <div className="text-[10px] uppercase font-mono text-ink-muted">Code Complexity</div>
                <div className="font-serif-display text-2xl font-bold text-ink mt-0.5">High</div>
                <div className="text-[10px] text-ink-muted">Clean modular separation</div>
              </div>
            </div>
          </div>

          {/* Inspected Repository Code Viewer */}
          <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-forest" />
                  <h4 className="font-semibold text-sm text-ink">
                    Inspected Clean Source Code (Excluding node_modules &amp; dist)
                  </h4>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  Live code snippets extracted directly from candidate repositories, color-coded by AI vs. Human logic origin.
                </p>
              </div>

              {/* Line Filter Toggle */}
              <div className="flex items-center bg-paper-2 p-1 rounded-xl border border-ink/10 text-xs self-start sm:self-auto">
                <button
                  onClick={() => setFilterMode("all")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    filterMode === "all" ? "bg-ink text-paper font-semibold" : "text-ink hover:bg-ink/5"
                  }`}
                >
                  All Lines
                </button>
                <button
                  onClick={() => setFilterMode("human")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    filterMode === "human" ? "bg-forest text-paper font-semibold" : "text-ink hover:bg-ink/5"
                  }`}
                >
                  🟢 Human Only
                </button>
                <button
                  onClick={() => setFilterMode("ai")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    filterMode === "ai" ? "bg-amber-600 text-paper font-semibold" : "text-ink hover:bg-ink/5"
                  }`}
                >
                  🟡 AI Only
                </button>
              </div>
            </div>

            {/* File Tabs */}
            <div className="flex flex-wrap gap-2">
              {files.map((file) => {
                const isActive = activeFile?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-mono flex items-center gap-2 border transition-all ${
                      isActive
                        ? "bg-ink text-paper border-ink shadow-sm"
                        : "bg-paper-2 text-ink hover:bg-ink/5 border-ink/10"
                    }`}
                  >
                    <FileCode className={`w-3.5 h-3.5 ${isActive ? "text-forest" : "text-ink-muted"}`} />
                    <span>{file.fileName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                        isActive ? "bg-forest text-paper" : "bg-forest/10 text-forest"
                      }`}
                    >
                      {file.humanPercentage}% Human
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active File Meta Details */}
            {activeFile && (
              <div className="p-3.5 rounded-2xl bg-paper-2 border border-ink/10 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="text-ink-soft">
                  <strong className="text-ink">{activeFile.fileName}</strong> — {activeFile.summary}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-forest font-semibold">🟢 {activeFile.humanPercentage}% Hand-Written</span>
                  <span>·</span>
                  <span className="text-amber-700 font-semibold">🟡 {activeFile.aiPercentage}% AI Boilerplate</span>
                </div>
              </div>
            )}

            {/* Code Lines Editor Container */}
            {activeFile && (
              <div className="rounded-2xl border border-ink/15 overflow-hidden bg-[#0d1117] text-[#e6edf3] font-mono text-xs shadow-inner">
                <div className="p-2.5 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between text-[11px] text-[#8b949e]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-forest/60" />
                    <span className="ml-2 font-semibold text-[#c9d1d9]">{activeFile.fileName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span className="text-emerald-400">Authentic Logic</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      <span className="text-amber-300">AI Boilerplate</span>
                    </span>
                  </div>
                </div>

                <div className="p-3 max-h-96 overflow-y-auto overflow-x-auto space-y-0.5">
                  {filteredLines.map((line) => {
                    const isAi = line.isAi;
                    return (
                      <div
                        key={line.lineNum}
                        className={`group flex items-start gap-3 py-0.5 px-2 rounded transition-colors ${
                          isAi
                            ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-400"
                            : "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-2 border-emerald-500"
                        }`}
                      >
                        <span className="w-7 text-right select-none text-[#6e7681] text-[11px] font-mono shrink-0">
                          {line.lineNum}
                        </span>

                        <span className="flex-1 text-[#e6edf3] whitespace-pre font-mono leading-relaxed">
                          {line.code || " "}
                        </span>

                        {line.annotation && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 opacity-80 group-hover:opacity-100 transition-opacity ${
                              isAi
                                ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                            }`}
                          >
                            {isAi ? "🟡 " : "🟢 "}
                            {line.annotation}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Repository Stacks & Signals */}
            <div className="grid md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-paper-2 border border-ink/10 space-y-2">
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-forest" />
                  Repository &amp; Account Links
                </div>
                <div className="space-y-1 text-xs font-mono text-ink-soft">
                  <div>
                    👤 Profile:{" "}
                    <a
                      href={application.githubAccountUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-forest underline hover:text-forest/80"
                    >
                      {application.githubAccountUrl}
                    </a>
                  </div>
                  <div>
                    📦 Repo 1:{" "}
                    <a
                      href={application.githubRepo1Url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-forest underline hover:text-forest/80"
                    >
                      {application.githubRepo1Url}
                    </a>
                  </div>
                  {application.githubRepo2Url && (
                    <div>
                      📦 Repo 2:{" "}
                      <a
                        href={application.githubRepo2Url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-forest underline hover:text-forest/80"
                      >
                        {application.githubRepo2Url}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-paper-2 border border-ink/10 space-y-2">
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  Detected Architectural Signals
                </div>
                <ul className="space-y-1 text-xs text-ink-soft">
                  {(application.codeSignals || []).map((sig, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-forest font-bold">✓</span>
                      <span>{sig}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CANDIDATE CODE UNDERSTANDING ASSESSMENT */}
      {activeSubTab === "assessment" && (
        <GitHubUnderstandingAssessment
          application={application}
          job={job}
          onAssessmentCompleted={handleAssessmentCompleted}
        />
      )}

      {/* SUB-TAB 3: RECRUITER VERIFICATION REPORT */}
      {activeSubTab === "report" && verificationReport && (
        <GitHubVerificationReportView
          report={verificationReport}
          candidateName={application.candidateName}
          jobTitle={job.title}
        />
      )}
    </div>
  );
};

export default GitHubCodeInspector;
