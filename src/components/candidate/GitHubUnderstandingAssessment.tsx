import React, { useState } from "react";
import {
  Code2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Terminal,
  Sparkles,
  ShieldCheck,
  FileCode,
  ArrowRight,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  GitHubCodeUnderstandingQuestion,
  GitHubVerificationReport,
  performGitHubCodeVerification,
} from "@/lib/githubVerifier";
import { CandidateApplicationSubmission, JobCutoffs } from "@/lib/hiringWorkflowEngine";

interface GitHubUnderstandingAssessmentProps {
  application: CandidateApplicationSubmission;
  job: JobCutoffs;
  onAssessmentCompleted?: (report: GitHubVerificationReport) => void;
}

export const GitHubUnderstandingAssessment: React.FC<GitHubUnderstandingAssessmentProps> = ({
  application,
  job,
  onAssessmentCompleted,
}) => {
  const { toast } = useToast();
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qId: number]: number }>({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [report, setReport] = useState<GitHubVerificationReport | null>(null);

  // Initialize questions
  const [questions, setQuestions] = useState<GitHubCodeUnderstandingQuestion[]>([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const rep = await performGitHubCodeVerification(
        application.githubRepo1Url || application.githubAccountUrl || "candidate-repo",
        {
          name: application.candidateName || "Candidate",
          email: application.candidateEmail,
          requiredSkills: job.requiredSkills,
        },
        application.inspectedCodeFiles,
        selectedAnswers
      );
      if (mounted) {
        setReport(rep);
        setQuestions(rep.understandingAssessment.questions);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [application.id, application.githubRepo1Url]);

  const handleSelectOption = (qId: number, optionIdx: number) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qId]: optionIdx }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedAnswers).length < questions.length) {
      toast({
        title: "Incomplete Assessment",
        description: `Please answer all ${questions.length} questions about your repository code before submitting.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedReport = await performGitHubCodeVerification(
        application.githubRepo1Url || application.githubAccountUrl || "candidate-repo",
        {
          name: application.candidateName || "Candidate",
          email: application.candidateEmail,
          requiredSkills: job.requiredSkills,
        },
        application.inspectedCodeFiles,
        selectedAnswers
      );

      setReport(updatedReport);
      setQuestions(updatedReport.understandingAssessment.questions);
      setIsSubmitted(true);

      if (onAssessmentCompleted) {
        onAssessmentCompleted(updatedReport);
      }

      toast({
        title: `Code Understanding Score: ${updatedReport.understandingScore}%`,
        description: `Your repository code comprehension answers have been evaluated and verified for HR.`,
      });
    } catch (e) {
      console.error("Error submitting code understanding assessment:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="space-y-6">
      {/* Assessment Header */}
      <div className="p-6 rounded-3xl bg-paper border border-ink/15 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-5 h-5 text-forest" />
              <h3 className="font-serif-display text-lg font-bold text-ink">
                Candidate Code Understanding Assessment
              </h3>
              <Badge variant="outline" className="font-mono text-xs bg-forest/10 text-forest border-forest/30">
                {questions.length} Custom Questions
              </Badge>
            </div>
            <p className="text-xs text-ink-soft">
              Answer the following questions about your actual repository code (<strong>{application.githubRepo1Url || "primary repo"}</strong>).
              This validates genuine authorship and understanding of your code architecture.
            </p>
          </div>

          {isSubmitted && report && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-forest/10 border border-forest/20 shrink-0">
              <div className="text-center">
                <div className="text-[10px] font-mono text-ink-muted uppercase">Understanding Score</div>
                <div className="font-serif-display text-2xl font-bold text-forest">{report.understandingScore}%</div>
              </div>
              <Badge className="bg-forest text-paper text-xs">
                {report.finalStatus}
              </Badge>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-ink/10 text-xs">
          <div className="flex justify-between text-ink-soft font-mono text-[11px]">
            <span>Answered: {answeredCount} of {questions.length} questions</span>
            <span>{Math.round((answeredCount / (questions.length || 1)) * 100)}% Complete</span>
          </div>
          <div className="w-full h-2 rounded-full bg-ink/10 overflow-hidden">
            <div
              className="h-full bg-forest rounded-full transition-all duration-300"
              style={{ width: `${(answeredCount / (questions.length || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {questions.map((q, idx) => {
          const selected = selectedAnswers[q.id];
          const isCorrect = q.isCorrect;

          return (
            <div
              key={q.id}
              className={`p-6 rounded-3xl bg-paper border transition-all shadow-sm ${
                isSubmitted
                  ? isCorrect
                    ? "border-forest/40 bg-forest/[0.02]"
                    : "border-destructive/30 bg-destructive/[0.02]"
                  : "border-ink/15 hover:border-forest/30"
              }`}
            >
              {/* Question Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-forest text-paper text-xs font-mono font-bold grid place-items-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-mono font-bold text-forest uppercase tracking-wider">
                    {q.conceptTested}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-ink-muted bg-paper-2 border border-ink/10 px-2.5 py-0.5 rounded-full self-start sm:self-auto flex items-center gap-1">
                  <FileCode className="w-3 h-3 text-forest" />
                  {q.fileSnippet.fileName} (Lines {q.fileSnippet.lineStart}–{q.fileSnippet.lineEnd})
                </span>
              </div>

              {/* Source Code Snippet Box */}
              <div className="mb-4 rounded-2xl border border-ink/15 overflow-hidden bg-[#0d1117] text-[#e6edf3] font-mono text-xs shadow-inner">
                <div className="p-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between text-[11px] text-[#8b949e]">
                  <span>📄 {q.fileSnippet.fileName}</span>
                  <span className="text-emerald-400">Actual Repository Snippet</span>
                </div>
                <pre className="p-3.5 overflow-x-auto text-xs leading-relaxed text-[#c9d1d9]">
                  {q.fileSnippet.code}
                </pre>
              </div>

              {/* Question Text */}
              <h4 className="font-semibold text-sm text-ink mb-3 pl-1">{q.question}</h4>

              {/* Options */}
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = selected === optIdx;
                  const isAnswerCorrect = optIdx === q.correctIndex;

                  let optionStyle = "bg-paper-2 text-ink-soft border-ink/10 hover:bg-ink/5";
                  if (isSubmitted) {
                    if (isAnswerCorrect) {
                      optionStyle = "bg-forest/10 border-forest/40 text-ink font-medium";
                    } else if (isSelected && !isAnswerCorrect) {
                      optionStyle = "bg-destructive/10 border-destructive/40 text-destructive";
                    }
                  } else if (isSelected) {
                    optionStyle = "bg-forest text-paper border-forest font-semibold";
                  }

                  return (
                    <button
                      key={optIdx}
                      disabled={isSubmitted}
                      onClick={() => handleSelectOption(q.id, optIdx)}
                      className={`w-full p-3 rounded-2xl text-xs flex items-start gap-3 text-left transition-all border ${optionStyle}`}
                    >
                      <span className="font-mono font-bold shrink-0 w-4">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isSubmitted && isAnswerCorrect && (
                        <span className="ml-auto text-[10px] font-mono uppercase bg-forest text-paper px-2 py-0.5 rounded-full shrink-0 font-semibold">
                          Verified Correct ✓
                        </span>
                      )}
                      {isSubmitted && isSelected && !isAnswerCorrect && (
                        <span className="ml-auto text-[10px] font-mono uppercase bg-destructive text-paper px-2 py-0.5 rounded-full shrink-0 font-semibold">
                          Your Selection ✕
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* AI Explanation / Rationale after Submit */}
              {isSubmitted && (
                <div className="mt-4 p-3.5 rounded-2xl bg-paper-2 border border-ink/10 text-xs space-y-1">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-forest" />
                    Code Architecture Rationale:
                  </div>
                  <p className="text-ink-soft leading-relaxed pl-5">{q.rationale}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit Button */}
      {!isSubmitted && (
        <div className="p-6 rounded-3xl bg-paper border border-ink/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="text-xs text-ink-soft">
            {allAnswered ? (
              <span className="text-forest font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> All {questions.length} questions answered. Ready to submit for evaluation!
              </span>
            ) : (
              <span>Please answer all questions ({answeredCount}/{questions.length} answered).</span>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            className="bg-forest text-paper hover:bg-forest/90 text-xs px-6 py-2.5 rounded-2xl shadow gap-2 shrink-0 font-semibold"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? "Evaluating Understanding..." : `Submit Code Understanding Assessment (${answeredCount}/${questions.length})`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default GitHubUnderstandingAssessment;
