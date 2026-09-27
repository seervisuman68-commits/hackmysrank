import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Code2,
  Terminal,
  FileCode,
  Award,
  RefreshCw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GitHubVerificationReport,
  GitHubCodeUnderstandingQuestion,
  performGitHubCodeVerification,
} from "@/lib/githubVerifier";
import { InspectedCodeFile } from "@/lib/hiringWorkflowEngine";

interface GitHubUnderstandingAssessmentProps {
  report: GitHubVerificationReport;
  candidateName: string;
  candidateEmail?: string;
  repoUrl: string;
  inspectedFiles: InspectedCodeFile[];
  onComplete: (updatedReport: GitHubVerificationReport) => void;
}

export const GitHubUnderstandingAssessment: React.FC<GitHubUnderstandingAssessmentProps> = ({
  report,
  candidateName,
  candidateEmail,
  repoUrl,
  inspectedFiles,
  onComplete,
}) => {
  const [answers, setAnswers] = useState<{ [qId: number]: number }>(() => {
    const initial: { [qId: number]: number } = {};
    for (const q of report.understandingAssessment.questions) {
      if (q.userAnswer !== undefined) {
        initial[q.id] = q.userAnswer;
      }
    }
    return initial;
  });

  const [activeQIndex, setActiveQIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(report.understandingAssessment.answeredCount > 0);

  const questions = report.understandingAssessment.questions;
  const currentQ = questions[activeQIndex] || questions[0];

  const handleSelectOption = (qId: number, optIdx: number) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  };

  const handleFinishQuiz = async () => {
    setIsSubmitting(true);
    try {
      const updated = await performGitHubCodeVerification(
        repoUrl,
        { name: candidateName, email: candidateEmail },
        inspectedFiles,
        answers
      );
      setSubmitted(true);
      onComplete(updated);
    } catch (e) {
      console.error("Error submitting code assessment:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setSubmitted(false);
    setActiveQIndex(0);
  };

  const answeredCount = Object.keys(answers).length;
  const isAllAnswered = answeredCount === questions.length;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-5 h-5 text-forest" />
            <h3 className="font-serif-display text-xl font-bold text-ink">
              Candidate Repository Code Comprehension Quiz
            </h3>
            <Badge variant="outline" className="font-mono text-xs bg-forest/10 text-forest border-forest/30 font-bold">
              5–10 Code Questions
            </Badge>
          </div>
          <p className="text-xs text-ink-soft">
            Questions synthesized directly from your repository's clean source files to verify genuine understanding of concurrency, memory management, and business logic.
          </p>
        </div>

        {submitted ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Comprehension Score</div>
              <div className="font-serif-display text-2xl font-bold text-forest">
                {report.understandingScore}%
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetake}
              className="text-xs gap-1.5 border-ink/15"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retake
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-xs text-ink-muted bg-paper-2 px-3 py-1.5 rounded-xl border border-ink/10">
            <span>Progress:</span>
            <strong className="text-ink">
              {answeredCount}/{questions.length} Answered
            </strong>
          </div>
        )}
      </div>

      {/* Question Carousel / Navigator */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {questions.map((q, idx) => {
          const isAnswered = answers[q.id] !== undefined;
          const isActive = idx === activeQIndex;
          const isCorrect = submitted && q.isCorrect;

          return (
            <button
              key={q.id}
              onClick={() => setActiveQIndex(idx)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? "bg-ink text-paper font-bold shadow"
                  : submitted
                  ? isCorrect
                    ? "bg-forest/15 text-forest border border-forest/30"
                    : "bg-destructive/15 text-destructive border border-destructive/30"
                  : isAnswered
                  ? "bg-forest/10 text-forest border border-forest/20"
                  : "bg-paper-2 text-ink-soft hover:bg-ink/5 border border-ink/10"
              }`}
            >
              <span>Q{idx + 1}</span>
              {submitted && (isCorrect ? <Check className="w-3 h-3 text-forest" /> : <XCircle className="w-3 h-3 text-destructive" />)}
            </button>
          );
        })}
      </div>

      {/* Active Question Box */}
      {currentQ && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-paper-2 border border-ink/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-forest uppercase tracking-wider">
                Concept: {currentQ.conceptTested}
              </span>
              <span className="text-[11px] font-mono text-ink-muted flex items-center gap-1">
                <FileCode className="w-3 h-3 text-forest" />
                {currentQ.fileSnippet.fileName} (Lines {currentQ.fileSnippet.lineStart}–{currentQ.fileSnippet.lineEnd})
              </span>
            </div>

            <h4 className="text-sm font-semibold text-ink leading-relaxed">
              {activeQIndex + 1}. {currentQ.question}
            </h4>

            {/* Code Snippet from Candidate Repo */}
            <div className="rounded-xl bg-[#1e1e1e] text-[#d4d4d4] p-3 text-xs font-mono overflow-x-auto border border-white/10 shadow-inner">
              <div className="text-[10px] text-white/40 pb-1 border-b border-white/10 mb-2 flex items-center justify-between">
                <span>{currentQ.fileSnippet.fileName}</span>
                <span className="uppercase">{currentQ.fileSnippet.language}</span>
              </div>
              <pre className="text-xs font-mono leading-relaxed">{currentQ.fileSnippet.code}</pre>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {currentQ.options.map((option, optIdx) => {
              const isSelected = answers[currentQ.id] === optIdx;
              const isCorrect = currentQ.correctIndex === optIdx;
              const showResult = submitted;

              return (
                <button
                  key={optIdx}
                  disabled={submitted}
                  onClick={() => handleSelectOption(currentQ.id, optIdx)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all text-xs flex items-start gap-3 ${
                    showResult
                      ? isCorrect
                        ? "bg-forest/10 border-forest/50 text-ink font-medium"
                        : isSelected
                        ? "bg-destructive/10 border-destructive/50 text-destructive"
                        : "bg-paper border-ink/10 text-ink-soft opacity-60"
                      : isSelected
                      ? "bg-forest/10 border-forest text-ink font-medium shadow-sm ring-1 ring-forest"
                      : "bg-paper hover:bg-paper-2 border-ink/15 text-ink"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full grid place-items-center font-mono text-[11px] font-bold shrink-0 mt-0.5 ${
                      isSelected
                        ? "bg-forest text-paper"
                        : "bg-paper-2 text-ink-muted border border-ink/20"
                    }`}
                  >
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <div className="flex-1 leading-relaxed">{option}</div>
                  {showResult && isCorrect && (
                    <Badge className="bg-forest text-paper text-[10px] shrink-0 font-mono">
                      Correct Answer
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Answer Rationale Explanation */}
          {submitted && (
            <div className="p-3.5 rounded-2xl bg-forest/5 border border-forest/20 text-xs space-y-1">
              <span className="font-semibold text-forest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Architectural Rationale:
              </span>
              <p className="text-ink-soft leading-relaxed pl-5">{currentQ.rationale}</p>
            </div>
          )}

          {/* Bottom Action Controls */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={activeQIndex === 0}
              onClick={() => setActiveQIndex((p) => Math.max(0, p - 1))}
              className="text-xs border border-ink/10"
            >
              Previous Question
            </Button>

            {activeQIndex < questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => setActiveQIndex((p) => Math.min(questions.length - 1, p + 1))}
                className="bg-ink text-paper hover:bg-ink/90 text-xs gap-1"
              >
                Next Question <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : !submitted ? (
              <Button
                size="sm"
                disabled={!isAllAnswered || isSubmitting}
                onClick={handleFinishQuiz}
                className="bg-forest text-paper hover:bg-forest/90 text-xs gap-1.5 shadow-sm font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmitting ? "Scoring Assessment..." : "Submit Code Assessment"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setActiveQIndex(0)}
                className="bg-forest text-paper hover:bg-forest/90 text-xs font-semibold"
              >
                Review First Question
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubUnderstandingAssessment;
