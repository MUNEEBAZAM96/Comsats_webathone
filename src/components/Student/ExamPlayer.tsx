"use client";

import { submitExam } from "@/server/studentExamActions";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
  LayoutGridIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../shadcnui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../shadcnui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../shadcnui/sheet";
import { QuestionCard } from "./QuestionCard";

type Question = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  points: number;
  order: number;
};

type ExamPlayerProps = {
  attemptId: string;
  examTitle: string;
  initialRemainingMs: number;
  questions: Question[];
  savedAnswers: { questionId: string; text: string | null }[];
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

export const ExamPlayer = ({
  attemptId,
  examTitle,
  initialRemainingMs,
  questions,
  savedAnswers,
}: ExamPlayerProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      savedAnswers.map(({ questionId, text }) => [questionId, text ?? ""]),
    ),
  );
  const [acknowledged, setAcknowledged] = useState(answers);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(
    Math.ceil(initialRemainingMs / 1000),
  );
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const router = useRouter();
  const submittingRef = useRef(false);
  const answersRef = useRef(answers);
  const acknowledgedRef = useRef(answers);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimeout = useRef<number>(undefined);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const currentQuestion = questions[currentIndex];
  const answered = questions.filter(({ id }) =>
    Boolean(answers[id]?.trim()),
  ).length;
  const hasUnsaved = questions.some(
    ({ id }) => (answers[id] ?? "") !== (acknowledged[id] ?? ""),
  );
  const currentFlagged =
    currentQuestion && flagged.includes(currentQuestion.id);

  const saveAnswer = useCallback(
    (id: string, text: string) => {
      const write = saveQueue.current.then(async () => {
        if ((acknowledgedRef.current[id] ?? "") === text) return;
        setPendingSaves((count) => count + 1);
        try {
          const { saveAnswer: sendAnswer } =
            await import("@/server/studentExamActions");
          await sendAnswer(attemptId, id, text);
          acknowledgedRef.current = { ...acknowledgedRef.current, [id]: text };
          setAcknowledged(acknowledgedRef.current);
        } finally {
          setPendingSaves((count) => count - 1);
        }
      });
      saveQueue.current = write.catch(() => setSaveFailed(true));
      return write;
    },
    [attemptId],
  );

  const finalize = useCallback(
    async (expired: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      window.clearTimeout(autosaveTimeout.current);
      setSubmitting(true);
      setSubmitError("");
      try {
        await saveQueue.current;
        if (!expired) {
          await Promise.all(
            Object.entries(answersRef.current).map(([id, text]) =>
              saveAnswer(id, text),
            ),
          );
        }
        await submitExam(attemptId);
        router.push(`/student/results/${attemptId}`);
      } catch {
        setSubmitError(
          expired
            ? "Submission could not be confirmed. Retry to check the result."
            : "Submission could not be confirmed. Check your connection and try again.",
        );
        setSubmitting(false);
        submittingRef.current = false;
      }
    },
    [attemptId, router, saveAnswer],
  );

  useEffect(() => {
    const deadline = performance.now() + initialRemainingMs;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((deadline - performance.now()) / 1000),
      );
      setTimeLeft(seconds);
      if (seconds === 0) {
        window.clearInterval(interval);
        void finalize(true);
      }
    };
    const interval = window.setInterval(tick, 250);
    tick();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(autosaveTimeout.current);
    };
  }, [finalize, initialRemainingMs]);

  const goTo = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    setNavigatorOpen(false);
    if (index === currentIndex) return;
    window.clearTimeout(autosaveTimeout.current);
    if (currentQuestion && timeLeft > 0) {
      void saveAnswer(
        currentQuestion.id,
        answersRef.current[currentQuestion.id] ?? "",
      ).catch(() => {});
    }
    setCurrentIndex(index);
    if (!navigatorOpen)
      window.requestAnimationFrame(() => questionHeading.current?.focus());
  };

  const changeAnswer = (id: string, text: string) => {
    answersRef.current = { ...answersRef.current, [id]: text };
    setAnswers(answersRef.current);
    window.clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = window.setTimeout(() => {
      void saveAnswer(id, text).catch(() => {});
    }, 600);
  };

  const syncLabel =
    pendingSaves > 0
      ? "Saving…"
      : hasUnsaved
        ? saveFailed
          ? "Some answers could not be saved"
          : "Unsaved changes"
        : "All answers saved";
  const deadlineLabel =
    timeLeft === 0
      ? "Time expired"
      : timeLeft <= 60
        ? "Final minute"
        : timeLeft <= 300
          ? "Five minutes or less"
          : "Time remaining";
  const questionNavigation = (
    <nav
      aria-label="Question navigation"
      className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2"
    >
      {questions.map((question, index) => {
        const isAnswered = Boolean(answers[question.id]?.trim());
        const isFlagged = flagged.includes(question.id);
        return (
          <button
            key={question.id}
            type="button"
            disabled={submitting}
            aria-current={index === currentIndex ? "step" : undefined}
            aria-label={`Question ${index + 1}, ${isAnswered ? "answered" : "unanswered"}${isFlagged ? ", marked for review" : ""}`}
            onClick={() => goTo(index)}
            className={cn(
              "relative grid min-h-11 place-items-center rounded-md border font-mono text-sm transition-colors hover:bg-accent focus-visible:outline-2",
              isAnswered
                ? "border-primary/45 bg-secondary text-secondary-foreground"
                : "border-input bg-card",
              index === currentIndex && "border-primary ring-1 ring-primary",
            )}
          >
            {index + 1}
            {isAnswered && (
              <CheckIcon
                aria-hidden="true"
                className="absolute bottom-0.5 left-0.5 size-3 text-success"
              />
            )}
            {isFlagged && (
              <FlagIcon
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 size-3 text-warning"
              />
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <section className="grid min-h-dvh grid-rows-[auto_1fr_auto]">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-[80rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="hidden sm:inline-flex [&_[data-brand-name]]:hidden" />
            <h1 className="min-w-0 break-words text-sm! font-semibold! sm:text-lg!">
              {examTitle}
            </h1>
          </div>
          <div
            className={cn(
              "flex min-w-28 shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 sm:px-3",
              timeLeft <= 60
                ? "bg-error-surface text-destructive"
                : timeLeft <= 300
                  ? "bg-warning-surface text-warning"
                  : "bg-secondary text-secondary-foreground",
            )}
          >
            <ClockIcon aria-hidden="true" className="size-4" />
            <div className="grid gap-0.5">
              <span
                role="status"
                className="text-[11px] leading-tight font-medium"
              >
                {deadlineLabel}
              </span>
              <span
                role="timer"
                aria-label="Time remaining"
                className="font-mono text-xl leading-none font-semibold tabular-nums"
              >
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[80rem] content-start gap-5 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_13rem] lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8 lg:px-8 lg:py-8">
        <div className="grid min-w-0 content-start gap-5">
          <div className="grid gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span id="question-progress" className="font-semibold">
                {answered} of {questions.length} answered
              </span>
              <span
                role="status"
                className={cn(
                  "inline-flex items-center gap-1.5 text-muted-foreground",
                  saveFailed && hasUnsaved && "text-destructive",
                )}
              >
                {hasUnsaved ? null : (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                  />
                )}
                {syncLabel}
              </span>
            </div>
            <progress
              aria-labelledby="question-progress"
              max={Math.max(1, questions.length)}
              value={answered}
              className="exam-progress h-2 w-full overflow-hidden rounded-full"
            />
          </div>

          {submitError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-error-surface px-4 py-3 text-sm text-destructive"
            >
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              {submitError}
            </p>
          )}

          {currentQuestion ? (
            <fieldset
              disabled={timeLeft === 0 || submitting}
              className="min-w-0 rounded-lg border bg-card p-5 shadow-sm sm:p-6 lg:p-8"
            >
              <h2
                ref={questionHeading}
                tabIndex={-1}
                className="mb-4 text-sm font-semibold text-primary focus:outline-none"
              >
                Question {currentIndex + 1} of {questions.length}
              </h2>
              <QuestionCard
                key={currentQuestion.id}
                question={currentQuestion}
                value={answers[currentQuestion.id] ?? ""}
                onChange={(text) => changeAnswer(currentQuestion.id, text)}
              />
            </fieldset>
          ) : (
            <p className="rounded-lg border bg-card p-6 text-muted-foreground">
              This examination has no questions.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {currentQuestion && (
              <Button
                variant="outline"
                type="button"
                disabled={timeLeft === 0 || submitting}
                aria-pressed={Boolean(currentFlagged)}
                className={cn(
                  currentFlagged &&
                    "border-warning bg-warning-surface text-warning",
                )}
                onClick={() =>
                  setFlagged((previous) =>
                    currentFlagged
                      ? previous.filter((id) => id !== currentQuestion.id)
                      : [...previous, currentQuestion.id],
                  )
                }
              >
                <FlagIcon aria-hidden="true" /> Mark for review
              </Button>
            )}
            <Sheet open={navigatorOpen} onOpenChange={setNavigatorOpen}>
              <SheetTrigger
                render={<Button variant="outline" className="md:hidden" />}
              >
                <LayoutGridIcon aria-hidden="true" /> Questions
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Questions</SheetTitle>
                  <SheetDescription>
                    {answered} answered · {flagged.length} marked for review
                  </SheetDescription>
                </SheetHeader>
                <div className="overflow-y-auto px-6 pb-6">
                  {questionNavigation}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <aside className="hidden min-w-0 self-start rounded-lg border bg-card p-4 md:grid md:gap-4 lg:p-5">
          <div className="grid gap-1">
            <h2 className="font-semibold">Questions</h2>
            <p className="text-sm text-muted-foreground">
              {flagged.length} marked for review
            </p>
          </div>
          {questionNavigation}
        </aside>
      </div>

      <footer className="sticky bottom-0 border-t bg-card">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0 || submitting}
            >
              <ChevronLeftIcon aria-hidden="true" /> Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= questions.length - 1 || submitting}
            >
              Next <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>

          {timeLeft === 0 ? (
            <Button onClick={() => void finalize(true)} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2Icon className="animate-spin" aria-hidden="true" />{" "}
                  Submitting…
                </>
              ) : (
                "Retry submission"
              )}
            </Button>
          ) : (
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
              <DialogTrigger render={<Button disabled={submitting} />}>
                {submitting ? (
                  <>
                    <Loader2Icon className="animate-spin" aria-hidden="true" />{" "}
                    Submitting…
                  </>
                ) : (
                  "Review & submit"
                )}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit examination?</DialogTitle>
                  <DialogDescription>
                    {answered} answered, {questions.length - answered}{" "}
                    unanswered, and {flagged.length} marked for review. After
                    submission, you cannot change your answers.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton>
                  <DialogClose
                    render={
                      <Button onClick={() => void finalize(timeLeft === 0)} />
                    }
                  >
                    Submit examination
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </footer>
    </section>
  );
};
