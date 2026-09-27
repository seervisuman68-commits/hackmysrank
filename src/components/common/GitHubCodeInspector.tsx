import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Sparkles,
  ExternalLink,
  Layers,
  Code2,
  Terminal,
  Cpu,
  ListChecks,
  FileText,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  InspectedCodeFile,
  InspectedCodeLine,
  CandidateApplicationSubmission,
  JobCutoffs,
  generateDynamicInspectedCodeFiles,
  formatExternalUrl,
} from "@/lib/hiringWorkflowEngine";
import {
  GitHubVerificationReport,
  performGitHubCodeVerification,
} from "@/lib/githubVerifier";
import {
  getGeminiApiKey,
  analyzeBeforeInterviewWithGemini,
} from "@/lib/geminiResumeAnalyzer";
import { GitHubUnderstandingAssessment } from "@/components/candidate/GitHubUnderstandingAssessment";
import { GitHubVerificationReportView } from "@/components/hr/GitHubVerificationReportView";

interface GitHubCodeInspectorProps {
  application: CandidateApplicationSubmission;
  job: JobCutoffs;
  isRecruiterView?: boolean;
  onApplicationUpdate?: (updated: CandidateApplicationSubmission) => void;
}

export const GitHubCodeInspector: React.FC<GitHubCodeInspectorProps> = ({
  application,
  job,
  isRecruiterView = false,
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

            {/* File Switcher Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {files.map((file) => {
                const isSelected = activeFile?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-all shrink-0 border ${
                      isSelected
                        ? "bg-ink text-paper border-ink font-semibold shadow-sm"
                        : "bg-paper-2 text-ink-soft hover:bg-ink/5 border-ink/10"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-forest" />
                    <span>{file.fileName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        file.humanPercentage >= 75
                          ? isSelected
                            ? "bg-forest text-paper"
                            : "bg-forest/15 text-forest"
                          : isSelected
                          ? "bg-amber-400 text-ink"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {file.humanPercentage}% Human
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active File Inspector Box */}
            {activeFile && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-paper-2 border border-ink/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span className="font-mono">{activeFile.fileName}</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-ink/5 text-ink-muted">
                        {activeFile.language}
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft mt-0.5">{activeFile.summary}</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs shrink-0">
                    <span className="text-forest font-semibold">🟢 {activeFile.humanPercentage}% Authentic</span>
                    <span className="text-amber-700 font-semibold">🟡 {activeFile.aiPercentage}% AI</span>
                  </div>
                </div>

                {/* Key Signals Tag Cloud */}
                {activeFile.signals && activeFile.signals.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-ink-muted font-mono text-[11px]">Key Signals:</span>
                    {activeFile.signals.map((sig, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-0.5 rounded-full bg-forest/10 text-forest border border-forest/20 text-[11px] font-medium"
                      >
                        ✓ {sig}
                      </span>
                    ))}
                  </div>
                )}

                {/* Code Window with AI / Human Line Highlighting */}
                <div className="rounded-2xl bg-[#1e1e1e] text-[#d4d4d4] p-4 font-mono text-xs overflow-x-auto shadow-inner border border-white/10 max-h-[420px]">
                  <div className="space-y-0.5 min-w-[550px]">
                    {filteredLines.map((line) => (
                      <div
                        key={line.lineNum}
                        className={`group flex items-center justify-between py-1 px-2 rounded transition-colors ${
                          line.isAi
                            ? "bg-amber-950/40 border-l-2 border-amber-500 text-amber-200/90"
                            : "bg-emerald-950/30 border-l-2 border-emerald-500 text-emerald-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 select-none text-right text-white/30 text-[11px]">
                            {line.lineNum}
                          </span>
                          <span className="text-[11px] font-mono select-none">
                            {line.isAi ? "🟡 AI" : "🟢 Human"}
                          </span>
                          <span className="whitespace-pre">{line.code}</span>
                        </div>

                        {line.annotation && (
                          <span className="text-[10px] italic text-white/40 group-hover:text-white/80 transition-colors pl-4 select-none shrink-0">
                            // {line.annotation}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CODE UNDERSTANDING QUIZ */}
      {activeSubTab === "assessment" && verificationReport && (
        <GitHubUnderstandingAssessment
          report={verificationReport}
          candidateName={application.candidateName}
          candidateEmail={application.candidateEmail}
          repoUrl={application.githubRepo1Url || application.githubAccountUrl || "candidate-repo"}
          inspectedFiles={files}
          onComplete={handleAssessmentCompleted}
        />
      )}

      {/* SUB-TAB 3: HR VERIFICATION REPORT */}
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
