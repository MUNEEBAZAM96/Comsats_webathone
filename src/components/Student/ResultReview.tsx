import { formatScore, scorePercent } from "@/lib/exam/grading";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CheckCircle2Icon,
  ClockIcon,
  MessageSquareTextIcon,
  MinusCircleIcon,
  PenLineIcon,
  XCircleIcon,
} from "lucide-react";
import type { ReactNode } from "react";

type Answer = {
  id: string;
  questionId: string;
  text: string | null;
  /** Final score; null while a manual mark is pending. */
  score: number | null;
  /** Staff only: the automatic score before any override. */
  autoScore?: number | null;
  feedback?: string | null;
  manuallyGraded?: boolean;
  requiresManual?: boolean;
  gradedBy?: string | null;
};

type Question = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  /** Correct option text(s), keywords or grader guidance; null when not revealed. */
  answer: string | null;
  /** Marked by a person (long answer, or short answer in manual mode). */
  manual?: boolean;
  points: number;
};

type ResultReviewProps = {
  totalScore: number | null;
  maxScore: number;
  submittedAt: string | null;
  questions: Question[];
  answers: Answer[];
  /** Show correct answers. Off for `score_only` reveal. */
  showAnswers?: boolean;
  passMarkPercent?: number | null;
  /** Staff also see grader guidance and the automatic score behind overrides. */
  audience?: "candidate" | "staff";
  /** Counts to show when per-question detail is withheld. */
  summary?: { answered: number; questions: number };
  /** Staff controls rendered under each question, keyed by question id. */
  answerActions?: Record<string, ReactNode>;
};

const CHOICE_TYPES = new Set(["multiple_choice", "single_choice", "true_false"]);
const lines = (s: string | null | undefined) =>
  (s ?? "").split("\n").filter(Boolean);

type Outcome = "correct" | "partial" | "wrong" | "unanswered" | "pending";

const OUTCOME_STYLE: Record<Outcome, string> = {
  correct: "border-success bg-success-surface",
  partial: "border-warning bg-warning-surface",
  wrong: "border-destructive bg-error-surface",
  unanswered: "border-muted-foreground/20 bg-muted/30",
  pending: "border-info/40 bg-info-surface",
};

const OutcomeIcon = ({ outcome }: { outcome: Outcome }) => {
  switch (outcome) {
    case "correct":
      return (
        <CheckCircle2Icon
          aria-label="Full marks"
          className="text-success size-5"
        />
      );
    case "partial":
      return (
        <MinusCircleIcon
          aria-label="Partial marks"
          className="text-warning size-5"
        />
      );
    case "wrong":
      return (
        <XCircleIcon
          aria-label="No marks"
          className="text-destructive size-5"
        />
      );
    case "pending":
      return (
        <ClockIcon
          aria-label="Awaiting marking"
          className="text-info size-5"
        />
      );
    default:
      return (
        <MinusCircleIcon
          aria-label="Not answered"
          className="text-muted-foreground size-5"
        />
      );
  }
};

export const ResultReview = ({
  totalScore,
  maxScore,
  submittedAt,
  questions,
  answers,
  showAnswers = true,
  passMarkPercent = null,
  audience = "candidate",
  summary,
  answerActions,
}: ResultReviewProps) => {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const answeredCount =
    summary?.answered ?? answers.filter((a) => a.text?.trim()).length;
  const questionCount = summary?.questions ?? questions.length;
  const pct = scorePercent(totalScore, maxScore);
  const pendingCount = answers.filter(
    (a) => a.requiresManual && a.score == null,
  ).length;
  const passed =
    pct != null && passMarkPercent != null ? pct >= passMarkPercent : null;
  const staff = audience === "staff";

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-4 rounded-lg border p-6 sm:grid-cols-3">
        <div className="text-center">
          <p
            className="text-3xl font-bold tabular-nums"
            data-testid="result-total">
            {totalScore == null ?
              "Pending"
            : `${formatScore(totalScore)}/${maxScore}`}
          </p>
          <p className="text-muted-foreground text-sm">Score</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums">
            {pct == null ? "—" : `${pct}%`}
          </p>
          <p className="text-muted-foreground text-sm">
            Percentage
            {passed != null && (
              <span
                className={cn(
                  "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                  passed ?
                    "bg-success-surface text-success"
                  : "bg-error-surface text-destructive",
                )}>
                {passed ? "Pass" : "Below pass mark"}
              </span>
            )}
          </p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums">
            {answeredCount}/{questionCount}
          </p>
          <p className="text-muted-foreground text-sm">Answered</p>
        </div>
      </div>

      {(submittedAt || pendingCount > 0) && (
        <p className="text-muted-foreground text-sm">
          {submittedAt &&
            `Submitted ${format(new Date(submittedAt), "MMM d, yyyy, h:mm a")}`}
          {pendingCount > 0 &&
            `${submittedAt ? " · " : ""}${pendingCount} ${pendingCount === 1 ? "answer awaits" : "answers await"} manual marking`}
        </p>
      )}

      {!showAnswers && !staff && (
        <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Your scores and any feedback are shown below. Correct answers are not
          shared for this exam.
        </p>
      )}

      <div className={cn("grid gap-4", questions.length === 0 && "hidden")}>
        <h2 className="text-lg font-medium">Answer review</h2>
        {questions.map((q, i) => {
          const answer = answerMap.get(q.id);
          const studentAnswer = answer?.text ?? "";
          const hasAnswer = Boolean(studentAnswer.trim());
          const pending = Boolean(answer?.requiresManual && answer.score == null);
          const score = answer?.score ?? 0;
          const outcome: Outcome =
            pending ? "pending"
            : !hasAnswer ? "unanswered"
            : score >= q.points ? "correct"
            : score > 0 ? "partial"
            : "wrong";
          const isChoice = CHOICE_TYPES.has(q.type);
          const options =
            q.type === "true_false" && lines(q.options).length !== 2 ?
              ["True", "False"]
            : lines(q.options);
          const selected =
            q.type === "multiple_choice" ? lines(studentAnswer) : [studentAnswer];
          const correct = showAnswers && !q.manual ? lines(q.answer) : [];
          const isWritten = q.type === "short_answer" || q.type === "long_answer";
          const overridden =
            answer?.manuallyGraded && !answer.requiresManual && !q.manual;

          return (
            <article
              key={q.id}
              aria-labelledby={`review-${q.id}`}
              data-question-type={q.type}
              className={cn(
                "grid gap-3 rounded-lg border p-5",
                OUTCOME_STYLE[outcome],
              )}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                    {i + 1}
                  </span>
                  <p
                    id={`review-${q.id}`}
                    className="min-w-0 font-medium break-words whitespace-pre-wrap">
                    {q.text}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <OutcomeIcon outcome={outcome} />
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {pending ? "—" : formatScore(score)}/{q.points}
                  </span>
                </div>
              </div>

              <div className="grid gap-2 pl-10">
                {isChoice && (
                  <ul className="grid gap-1">
                    {options.map((opt) => {
                      const isSelected = selected.includes(opt);
                      const isRight = correct.includes(opt);
                      const isWrong = correct.length > 0 && isSelected && !isRight;
                      return (
                        <li
                          key={opt}
                          className={cn(
                            "rounded px-3 py-1.5 text-sm",
                            isRight ? "bg-success-surface text-success"
                            : isWrong ? "bg-error-surface text-destructive"
                            : isSelected ? "bg-secondary text-secondary-foreground"
                            : "text-muted-foreground",
                          )}>
                          {opt}
                          {isRight && (
                            <span className="ml-2 text-xs">(Correct answer)</span>
                          )}
                          {isSelected && (
                            <span className="ml-2 text-xs">
                              ({staff ? "Selected" : "Your answer"})
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isWritten && (
                  <div className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">
                      {staff ? "Candidate answer:" : "Your answer:"}
                    </span>
                    <p
                      className={cn(
                        "bg-background/60 rounded-md border px-3 py-2 break-words whitespace-pre-wrap",
                        !hasAnswer && "text-muted-foreground italic",
                      )}>
                      {hasAnswer ? studentAnswer : "No answer"}
                    </p>
                    {q.answer && (q.manual ? staff : showAnswers || staff) && (
                      <p>
                        <span className="text-muted-foreground">
                          {q.manual ? "Marking guidance: " : "Expected keywords: "}
                        </span>
                        <span className="text-success whitespace-pre-wrap">
                          {q.answer}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {isChoice && !hasAnswer && (
                  <p className="text-muted-foreground text-sm italic">
                    No answer given
                  </p>
                )}

                {pending && (
                  <p className="text-info flex items-center gap-1.5 text-sm">
                    <ClockIcon
                      aria-hidden="true"
                      className="size-4"
                    />
                    Awaiting manual marking
                  </p>
                )}

                {answer?.manuallyGraded && !pending && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <PenLineIcon
                      aria-hidden="true"
                      className="size-3.5"
                    />
                    {overridden ?
                      staff ?
                        `Automatic score ${formatScore(answer.autoScore)} overridden${answer.gradedBy ? ` by ${answer.gradedBy}` : ""}`
                      : "Score adjusted by an examiner"
                    : `Marked by ${staff && answer.gradedBy ? answer.gradedBy : "an examiner"}`}
                  </p>
                )}

                {answer?.feedback && (
                  <div className="bg-background/60 grid gap-1 rounded-md border px-3 py-2 text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                      <MessageSquareTextIcon
                        aria-hidden="true"
                        className="size-3.5"
                      />
                      Examiner feedback
                    </span>
                    <p className="break-words whitespace-pre-wrap">
                      {answer.feedback}
                    </p>
                  </div>
                )}

                {answerActions?.[q.id]}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
