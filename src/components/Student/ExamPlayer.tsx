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
  InfoIcon,
  LayoutGridIcon,
  Loader2Icon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DigitalScratchpad } from "@/features/scratchpad/components/DigitalScratchpad";
import { OfflineSyncBanner } from "@/features/exam-workspace/offline/OfflineSyncBanner";
import {
  clearAttemptAnswers,
  listPendingAnswers,
  markAnswerSynced,
  upsertLocalAnswer,
} from "@/features/exam-workspace/offline/answer-storage";
import { useOnlineStatus } from "@/features/exam-workspace/offline/connectivity";
import {
  clearReviewFlags,
  useReviewFlags,
} from "@/features/exam-workspace/reviewFlags";
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
  instructions?: string | null;
  /** Remaining time computed on the server at render. */
  initialRemainingMs: number;
  questions: Question[];
  savedAnswers: { questionId: string; text: string | null }[];
};

/** Re-check the server clock this often while the exam is open. */
const CLOCK_RESYNC_MS = 60_000;
/** Flush the in-flight edit this many seconds before the deadline. */
const FINAL_FLUSH_SECONDS = 3;
const AUTOSAVE_DELAY_MS = 600;

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toString().padStart(2, "0");
  return hours > 0 ?
      `${hours}:${minutes.toString().padStart(2, "0")}:${secs}`
    : `${minutes.toString().padStart(2, "0")}:${secs}`;
};

const isAnsweredText = (text: string | undefined) => Boolean(text?.trim());

export const ExamPlayer = ({
  attemptId,
  examTitle,
  instructions,
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
  const [timeLeft, setTimeLeft] = useState(
    Math.ceil(initialRemainingMs / 1000),
  );
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const router = useRouter();
  const online = useOnlineStatus();
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const { flagged, toggle: toggleFlag } = useReviewFlags(
    attemptId,
    questionIds,
  );
  const submittingRef = useRef(false);
  const answersRef = useRef(answers);
  const acknowledgedRef = useRef(answers);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimeout = useRef<number>(undefined);
  /** Deadline on the monotonic `performance.now()` clock; set in effects. */
  const deadlinePerfRef = useRef<number | null>(null);
  const finalFlushDoneRef = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const currentQuestion = questions[currentIndex];
  const answered = questions.filter(({ id }) =>
    isAnsweredText(answers[id]),
  ).length;
  const unanswered = questions.length - answered;
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
          const local = await upsertLocalAnswer({
            attemptId,
            questionId: id,
            text,
          });
          const { saveAnswer: sendAnswer } =
            await import("@/server/studentExamActions");
          await sendAnswer(attemptId, id, text);
          await markAnswerSynced(local.id);
          acknowledgedRef.current = { ...acknowledgedRef.current, [id]: text };
          setAcknowledged(acknowledgedRef.current);
          setSaveFailed(false);
        } catch (error) {
          setSaveFailed(true);
          throw error;
        } finally {
          setPendingSaves((count) => count - 1);
        }
      });
      saveQueue.current = write.catch(() => {
        setSaveFailed(true);
      });
      return write;
    },
    [attemptId],
  );

  /** Send every answer the server has not acknowledged yet. */
  const flushUnsaved = useCallback(() => {
    window.clearTimeout(autosaveTimeout.current);
    return Promise.all(
      Object.entries(answersRef.current)
        .filter(([id, text]) => (acknowledgedRef.current[id] ?? "") !== text)
        .map(([id, text]) => saveAnswer(id, text).catch(() => undefined)),
    );
  }, [saveAnswer]);

  const goToResult = useCallback(() => {
    clearReviewFlags(attemptId);
    router.replace(`/student/results/${attemptId}` as Route);
  }, [attemptId, router]);

  const finalize = useCallback(
    async (expired: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setAutoSubmitting(expired);
      setSubmitError("");
      try {
        await saveQueue.current.catch(() => undefined);
        // Flush on manual and timer submit alike so debounced edits are not
        // dropped. The server rejects any write that lands after the deadline.
        await flushUnsaved();
        await submitExam(attemptId);
        try {
          await clearAttemptAnswers(attemptId);
        } catch {
          // Local cleanup is best-effort; server submit already succeeded.
        }
        goToResult();
      } catch {
        setSubmitError(
          expired ?
            "Time is up, but submission could not be confirmed. Your saved answers are kept — retry to finish."
          : "Submission could not be confirmed. Check your connection and try again.",
        );
        setSubmitting(false);
        setAutoSubmitting(false);
        submittingRef.current = false;
      }
    },
    [attemptId, flushUnsaved, goToResult],
  );

  // Countdown on the monotonic clock, seeded from server-computed remaining time.
  useEffect(() => {
    deadlinePerfRef.current = performance.now() + initialRemainingMs;
    const tick = () => {
      const deadline = deadlinePerfRef.current ?? performance.now();
      const seconds = Math.max(
        0,
        Math.ceil((deadline - performance.now()) / 1000),
      );
      setTimeLeft(seconds);
      if (
        seconds <= FINAL_FLUSH_SECONDS &&
        seconds > 0 &&
        !finalFlushDoneRef.current
      ) {
        finalFlushDoneRef.current = true;
        void flushUnsaved();
      }
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
  }, [finalize, flushUnsaved, initialRemainingMs]);

  // Correct drift (sleep, throttled tabs) from the server clock. Never extends
  // the server deadline — the server rejects late writes regardless.
  useEffect(() => {
    let cancelled = false;
    const resync = async () => {
      if (submittingRef.current) return;
      try {
        const { getAttemptClock } = await import(
          "@/server/studentExamActions"
        );
        const clock = await getAttemptClock(attemptId);
        if (cancelled) return;
        if (clock.status !== "in_progress") {
          submittingRef.current = true;
          goToResult();
          return;
        }
        deadlinePerfRef.current = performance.now() + clock.remainingMs;
        if (clock.remainingMs > FINAL_FLUSH_SECONDS * 1000) {
          finalFlushDoneRef.current = false;
          // Retry answers whose earlier save failed.
          void flushUnsaved();
        }
      } catch {
        // Offline or transient failure — keep the local countdown.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    const interval = window.setInterval(() => void resync(), CLOCK_RESYNC_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [attemptId, flushUnsaved, goToResult]);

  // Restore answers saved on this device but never acknowledged by the server
  // (e.g. edited offline, then refreshed). Only fills questions the candidate
  // has not edited since load; the server still validates every write.
  useEffect(() => {
    let cancelled = false;
    const known = new Set(questionIds);
    void listPendingAnswers(attemptId)
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const next = { ...answersRef.current };
        const restored: [string, string][] = [];
        for (const row of rows) {
          if (!known.has(row.questionId)) continue;
          const untouched =
            (next[row.questionId] ?? "") ===
            (acknowledgedRef.current[row.questionId] ?? "");
          if (untouched && next[row.questionId] !== row.text) {
            next[row.questionId] = row.text;
            restored.push([row.questionId, row.text]);
          }
        }
        if (restored.length === 0) return;
        answersRef.current = next;
        setAnswers(next);
        restored.forEach(([id, text]) => {
          void saveAnswer(id, text).catch(() => undefined);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attemptId, questionIds, saveAnswer]);

  // When connectivity returns, push anything the server has not acknowledged.
  useEffect(() => {
    if (online && !submittingRef.current) void flushUnsaved();
  }, [online, flushUnsaved]);

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
    }, AUTOSAVE_DELAY_MS);
  };

  const syncLabel =
    !online && hasUnsaved ? "Offline — answers kept on this device"
    : pendingSaves > 0 ? "Saving…"
    : hasUnsaved ?
      saveFailed ? "Some answers could not be saved — retrying"
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
        const isAnswered = isAnsweredText(answers[question.id]);
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
            {instructions?.trim() && (
              <Dialog>
                <DialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="lg"
                      className="shrink-0"
                    />
                  }>
                  <InfoIcon aria-hidden="true" />
                  <span className="hidden sm:inline">Instructions</span>
                  <span className="sr-only sm:hidden">Instructions</span>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Instructions</DialogTitle>
                    <DialogDescription className="whitespace-pre-wrap">
                      {instructions}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
            )}
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

          <OfflineSyncBanner
            attemptId={attemptId}
            saveAnswer={async (aid, qid, text) => {
              const { saveAnswer: sendAnswer } =
                await import("@/server/studentExamActions");
              await sendAnswer(aid, qid, text);
            }}
          />

          {autoSubmitting && !submitError && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-md bg-warning-surface px-4 py-3 text-sm text-warning"
            >
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              Time is up — submitting your saved answers…
            </p>
          )}

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

          <DigitalScratchpad attemptId={attemptId} />

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
                onClick={() => toggleFlag(currentQuestion.id)}
              >
                <FlagIcon aria-hidden="true" />
                {currentFlagged ? "Marked for review" : "Mark for review"}
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
                    After submission, you cannot change your answers.
                  </DialogDescription>
                </DialogHeader>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-secondary p-3">
                    <dt className="text-xs text-muted-foreground">Answered</dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {answered}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">
                      Unanswered
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {unanswered}
                    </dd>
                  </div>
                  <div className="rounded-md bg-warning-surface p-3">
                    <dt className="text-xs text-muted-foreground">
                      For review
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {flagged.length}
                    </dd>
                  </div>
                </dl>
                {(unanswered > 0 || flagged.length > 0) && (
                  <div className="grid gap-2 text-sm">
                    <p className="text-muted-foreground">
                      Jump to a question to check it:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {questions.map((q, index) => {
                        const needsLook =
                          !isAnsweredText(answers[q.id]) ||
                          flagged.includes(q.id);
                        if (!needsLook) return null;
                        return (
                          <Button
                            key={q.id}
                            variant="outline"
                            size="lg"
                            aria-label={`Go to question ${index + 1}`}
                            onClick={() => {
                              setReviewOpen(false);
                              goTo(index);
                            }}
                          >
                            {index + 1}
                            {flagged.includes(q.id) && (
                              <FlagIcon
                                aria-hidden="true"
                                className="text-warning"
                              />
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(!online || hasUnsaved) && (
                  <p className="flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-sm text-warning">
                    <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
                    {online ?
                      "Some answers are still saving. They will be sent before submission."
                    : "You are offline. Submission needs a connection — your answers stay on this device until then."}
                  </p>
                )}
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
