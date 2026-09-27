import React from "react";
import {
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Code2,
  FileCode,
  Sparkles,
  ExternalLink,
  Layers,
  Terminal,
  Cpu,
  Users,
  GitCommit,
  Clock,
  Star,
  GitFork,
  AlertTriangle,
  Info,
  Activity,
  FileSearch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitHubVerificationReport,
  GitHubVerificationFinalStatus,
  AI_DETECTION_DISCLAIMER,
} from "@/lib/githubVerifier";
import { CandidateApplicationSubmission, JobCutoffs } from "@/lib/hiringWorkflowEngine";

interface GitHubVerificationReportViewProps {
  report: GitHubVerificationReport;
  candidateName: string;
  jobTitle?: string;
}

export const GitHubVerificationReportView: React.FC<GitHubVerificationReportViewProps> = ({
  report,
  candidateName,
  jobTitle,
}) => {
  const getStatusBadge = (status: GitHubVerificationFinalStatus) => {
    switch (status) {
      case "HAND-WRITTEN":
        return {
          bg: "bg-forest/10 text-forest border-forest/30",
          icon: <CheckCircle2 className="w-4 h-4 text-forest" />,
          label: "HAND-WRITTEN",
          description: "Verified natural incremental development, bespoke domain logic, and zero AI co-authorship metadata.",
        };
      case "AI-GENERATED":
        return {
          bg: "bg-destructive/10 text-destructive border-destructive/30",
          icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
          label: "AI-GENERATED",
          description: "Single-commit bulk dump, explicit AI co-authorship markers, or hyper-uniform boilerplate detected.",
        };
      case "AI-ASSISTED":
        return {
          bg: "bg-amber-500/10 text-amber-800 border-amber-500/30",
          icon: <Cpu className="w-4 h-4 text-amber-600" />,
          label: "AI-ASSISTED",
          description: "Authentic developer commits accompanied by AI co-pilots, automated scaffolds, or helper generation.",
        };
      case "MIXED":
        return {
          bg: "bg-amber-500/15 text-amber-900 border-amber-500/40",
          icon: <AlertCircle className="w-4 h-4 text-amber-700" />,
          label: "MIXED",
          description: "Combination of custom human-authored business logic and generic AI boilerplate templates.",
        };
      case "UNCERTAIN":
      default:
        return {
          bg: "bg-ink/10 text-ink-soft border-ink/20",
          icon: <HelpCircle className="w-4 h-4 text-ink-muted" />,
          label: "UNCERTAIN",
          description: "Insufficient verifiable commit/source evidence. Manual code walkthrough recommended.",
        };
    }
  };

  const statusConfig = getStatusBadge(report.finalStatus);

  return (
    <div className="space-y-6">
      {/* Top Summary Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-forest" />
              <span className="font-mono text-xs text-forest uppercase tracking-wider font-bold">
                Recruiter GitHub Verification Report
              </span>
            </div>
            <h2 className="font-serif-display text-2xl md:text-3xl text-ink font-bold">
              {candidateName} — Repository Authorship Audit
            </h2>
            <p className="text-xs text-ink-soft">
              Multi-signal static analysis: Git commit timing, author history, AI attribution metadata, clean code structure, and candidate comprehension.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-paper-2 p-4 rounded-2xl border border-ink/10">
            {/* Final Status */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase text-ink-muted">Authorship Classification</div>
              <Badge variant="outline" className={`font-mono text-xs px-3 py-1 flex items-center gap-1.5 font-bold ${statusConfig.bg}`}>
                {statusConfig.icon}
                <span>{statusConfig.label}</span>
              </Badge>
            </div>

            {/* Human Hand-Written vs AI Score */}
            <div className="space-y-1 border-l border-ink/10 pl-4">
              <div className="text-[10px] font-mono uppercase text-ink-muted">Human vs AI Ratio</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif-display text-2xl font-bold text-forest">
                  {report.authenticityPercentage ?? 88}%
                </span>
                <span className="text-[10px] font-mono text-ink-muted">
                  Human ({report.aiWrittenPercentage ?? 12}% AI)
                </span>
              </div>
            </div>

            {/* GitHub Quality Score */}
            <div className="space-y-1 border-l border-ink/10 pl-4">
              <div className="text-[10px] font-mono uppercase text-ink-muted">GitHub Quality Score</div>
              <div className="flex items-baseline gap-1">
                <span className="font-serif-display text-2xl font-bold text-ink">
                  {report.githubScore ?? 88}
                </span>
                <span className="text-[10px] font-mono text-ink-muted">/100</span>
              </div>
            </div>

            {/* Understanding Score */}
            <div className="space-y-1 border-l border-ink/10 pl-4">
              <div className="text-[10px] font-mono uppercase text-ink-muted">Understanding Score</div>
              <div className="flex items-baseline gap-1">
                <span className="font-serif-display text-2xl font-bold text-forest">{report.understandingScore}%</span>
                <span className="text-[10px] font-mono text-ink-muted">
                  ({report.understandingAssessment.correctCount}/{report.understandingAssessment.totalQuestions} Correct)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Executive Summary Note */}
        <div className="p-4 rounded-2xl bg-forest/5 border border-forest/15 text-xs text-ink-soft space-y-1">
          <span className="font-semibold text-ink flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-forest" /> Verification Executive Summary:
          </span>
          <p className="leading-relaxed pl-5">{report.finalSummary}</p>
        </div>
      </div>

      {/* Multi-Signal Verification Breakdown Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-paper border border-ink/10 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase text-ink-muted flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-forest" /> Human Authenticity
          </div>
          <div className="font-semibold text-sm text-forest">{report.authenticityPercentage ?? 88}% Verified</div>
          <div className="text-[10px] text-ink-muted">{report.aiWrittenPercentage ?? 12}% AI / Scaffold</div>
        </div>

        <div className="p-4 rounded-2xl bg-paper border border-ink/10 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase text-ink-muted flex items-center gap-1">
            <GitCommit className="w-3 h-3 text-forest" /> Commit Cadence
          </div>
          <div className="font-semibold text-sm text-ink">{report.commitAnalysis.cadence}</div>
          <div className="text-[10px] text-ink-muted">{report.commitAnalysis.totalCommits} commits analyzed</div>
        </div>

        <div className="p-4 rounded-2xl bg-paper border border-ink/10 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase text-ink-muted flex items-center gap-1">
            <Users className="w-3 h-3 text-forest" /> Candidate Contribution
          </div>
          <div className="font-semibold text-sm text-forest">{report.commitAnalysis.candidateContributionPercent}% of Commits</div>
          <div className="text-[10px] text-ink-muted">{report.commitAnalysis.authorCount} distinct author(s)</div>
        </div>

        <div className="p-4 rounded-2xl bg-paper border border-ink/10 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase text-ink-muted flex items-center gap-1">
            <Activity className="w-3 h-3 text-forest" /> Comment Uniformity
          </div>
          <div className="font-semibold text-sm text-ink">
            {report.codeAnalysis.heuristicSignals?.uniformCommentDensity ?? 15}% Density
          </div>
          <div className="text-[10px] text-ink-muted">Generic statement ratio</div>
        </div>
      </div>

      {/* Grid: Repo Details & Commit Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 1. Repository Details */}
        <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-forest" />
              1. Repository Details
            </h3>
            <a
              href={report.repoDetails.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-forest underline inline-flex items-center gap-1 hover:text-forest/80"
            >
              <span>{report.repoDetails.name}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10">
              <div className="text-[10px] font-mono text-ink-muted">Owner / Organization</div>
              <div className="font-semibold text-ink mt-0.5">{report.repoDetails.owner}</div>
            </div>
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10">
              <div className="text-[10px] font-mono text-ink-muted">Primary Language</div>
              <div className="font-semibold text-forest mt-0.5">{report.repoDetails.primaryLanguage}</div>
            </div>
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10">
              <div className="text-[10px] font-mono text-ink-muted">Stars &amp; Forks</div>
              <div className="font-semibold text-ink mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> {report.repoDetails.stars}</span>
                <span className="flex items-center gap-1"><GitFork className="w-3 h-3 text-ink-muted" /> {report.repoDetails.forks}</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10">
              <div className="text-[10px] font-mono text-ink-muted">Default Branch</div>
              <div className="font-mono text-ink mt-0.5">{report.repoDetails.defaultBranch}</div>
            </div>
          </div>

          <div className="text-xs text-ink-soft space-y-1 pt-1">
            <div className="text-ink font-medium">Description:</div>
            <p className="text-ink-soft leading-relaxed italic">{report.repoDetails.description || "No description provided."}</p>
          </div>
        </div>

        {/* 2. Commit Analysis */}
        <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-forest" />
              2. Git Commit &amp; Author Analysis
            </h3>
            <span className="text-xs font-mono text-forest bg-forest/10 px-2.5 py-0.5 rounded-full font-semibold">
              {report.commitAnalysis.totalCommits} Commits Analyzed
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-ink-muted">Candidate Contribution</div>
                <div className="font-semibold text-forest text-base">{report.commitAnalysis.candidateContributionPercent}% of Commits</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono text-ink-muted">Commit Cadence</div>
                <div className="font-semibold text-ink">{report.commitAnalysis.cadence}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-ink flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-forest" /> Author Breakdown:
              </div>
              <div className="space-y-1">
                {(report.commitAnalysis.authors || []).map((author, idx) => (
                  <div key={idx} className="p-2 rounded-xl bg-paper-2 border border-ink/5 flex items-center justify-between font-mono text-[11px]">
                    <span className={author.isCandidate ? "text-forest font-bold" : "text-ink"}>
                      {author.isCandidate ? "👤 " : "👥 "} {author.name} {author.isCandidate && "(Candidate)"}
                    </span>
                    <span className="text-ink-muted">{author.commitCount} commits ({author.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: AI-Authorship Evidence & Code Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 3. AI-Authorship Evidence */}
        <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
              <Cpu className="w-4 h-4 text-forest" />
              3. AI-Authorship Evidence
            </h3>
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                report.aiAuthorshipEvidence.detected
                  ? "bg-amber-500/10 text-amber-800 border-amber-500/30"
                  : "bg-forest/10 text-forest border-forest/30"
              }`}
            >
              {report.aiAuthorshipEvidence.detected ? "Indicators Found" : "No Evidence Found ✓"}
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-medium text-ink">Commit Message &amp; Source Scan Findings:</div>
            <ul className="space-y-2">
              {report.aiAuthorshipEvidence.evidenceList.map((item, idx) => (
                <li key={idx} className="p-2.5 rounded-xl bg-paper-2 border border-ink/10 flex items-start gap-2 text-ink-soft">
                  <span className="text-forest font-bold shrink-0 mt-0.5">▸</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 4. Code Analysis (Excluding node_modules, build, dist) */}
        <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
              <Layers className="w-4 h-4 text-forest" />
              4. Clean Source Code Analysis
            </h3>
            <span className="text-xs font-mono text-ink-muted">
              {report.codeAnalysis.inspectedFilesCount} Clean Files Inspected
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-2xl bg-paper-2 border border-ink/10 space-y-1">
              <div className="text-[10px] font-mono text-ink-muted">Excluded Directories &amp; Generated Artifacts:</div>
              <div className="flex flex-wrap gap-1 font-mono text-[10px] text-ink-muted">
                {report.codeAnalysis.excludedPaths.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded bg-ink/5 border border-ink/10">
                    ✕ {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-medium text-ink">Architecture &amp; Code Signals:</div>
              <ul className="space-y-1 text-ink-soft">
                {report.codeAnalysis.signals.map((sig, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0 mt-0.5" />
                    <span>{sig}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Candidate Answers & Code Understanding Breakdown */}
      <div className="p-6 md:p-8 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink/10 pb-3">
          <div>
            <h3 className="font-semibold text-base text-ink flex items-center gap-2">
              <Code2 className="w-4 h-4 text-forest" />
              5. Candidate Answers &amp; Code Understanding Evaluation
            </h3>
            <p className="text-xs text-ink-soft mt-0.5">
              5–10 comprehension questions generated directly from candidate's actual repository source code.
            </p>
          </div>
          <div className="font-mono text-xs text-forest bg-forest/10 px-3 py-1 rounded-full font-bold self-start sm:self-auto">
            Understanding Score: {report.understandingScore}%
          </div>
        </div>

        <div className="space-y-4 pt-2">
          {report.understandingAssessment.questions.map((q, idx) => {
            const hasAnswer = q.userAnswer !== undefined;
            const isCorrect = q.isCorrect;

            return (
              <div
                key={q.id}
                className={`p-5 rounded-2xl border text-xs space-y-3 ${
                  hasAnswer
                    ? isCorrect
                      ? "bg-forest/5 border-forest/30"
                      : "bg-destructive/5 border-destructive/30"
                    : "bg-paper-2 border-ink/10"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-forest text-paper text-[11px] font-mono font-bold grid place-items-center">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-bold text-forest uppercase">{q.conceptTested}</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted">
                    Source: {q.fileSnippet.fileName} (Lines {q.fileSnippet.lineStart}–{q.fileSnippet.lineEnd})
                  </span>
                </div>

                <div className="font-semibold text-ink pl-7">{q.question}</div>

                <div className="pl-7 space-y-1.5">
                  {q.options.map((opt, optIdx) => {
                    const isCandidateChoice = q.userAnswer === optIdx;
                    const isCorrectChoice = optIdx === q.correctIndex;

                    return (
                      <div
                        key={optIdx}
                        className={`p-2 rounded-xl flex items-center justify-between gap-2 text-[11px] ${
                          isCorrectChoice
                            ? "bg-forest/15 border border-forest/40 text-ink font-medium"
                            : isCandidateChoice
                            ? "bg-destructive/15 border border-destructive/40 text-destructive font-medium"
                            : "bg-paper text-ink-soft border border-ink/5"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{String.fromCharCode(65 + optIdx)}.</span>
                          <span>{opt}</span>
                        </div>
                        {isCandidateChoice && (
                          <span className="text-[9px] font-mono uppercase bg-ink text-paper px-1.5 py-0.5 rounded shrink-0">
                            Candidate Choice
                          </span>
                        )}
                        {isCorrectChoice && (
                          <span className="text-[9px] font-mono uppercase bg-forest text-paper px-1.5 py-0.5 rounded shrink-0">
                            Verified Correct
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pl-7 pt-2 border-t border-ink/10 text-[11px] text-ink-muted italic">
                  <strong>AI Architecture Verification:</strong> {q.rationale}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Required AI Heuristics Disclaimer */}
      <div className="p-4 rounded-2xl bg-paper-2 border border-ink/10 flex items-start gap-3 text-xs text-ink-muted">
        <Info className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-ink">Probabilistic Heuristics Disclaimer: </strong>
          {report.disclaimer || AI_DETECTION_DISCLAIMER}
        </div>
      </div>
    </div>
  );
};

export default GitHubVerificationReportView;
