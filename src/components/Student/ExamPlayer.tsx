"use client";

import { BrandMark } from "@/components/BrandMark";
import {
  AnnouncementBanner,
  AnnouncementsButton,
} from "@/features/exam-workspace/components/StudentAnnouncements";
import { SyncStatusIndicator } from "@/features/exam-workspace/components/SyncStatusIndicator";
import {
  clearAttemptAnswers,
  saveClockMeta,
  seedSeqFromServer,
} from "@/features/exam-workspace/offline/answer-storage";
import {
  isEffectivelyOnline,
  reportNetworkResult,
  useOnlineStatus,
} from "@/features/exam-workspace/offline/connectivity";
import { createEventBuffer } from "@/features/exam-workspace/offline/eventBuffer";
import { useAttemptTabGuard } from "@/features/exam-workspace/offline/multiTab";
import { createAnswerSyncQueue } from "@/features/exam-workspace/offline/sync-manager";
import type { LocalAnswer } from "@/features/exam-workspace/offline/types";
import {
  clearReviewFlags,
  useReviewFlags,
} from "@/features/exam-workspace/reviewFlags";
import { DigitalScratchpad } from "@/features/scratchpad/components/DigitalScratchpad";
import {
  MAX_FINAL_ITEMS,
  type StudentAnnouncement,
} from "@/lib/exam/syncSchemas";
import { cn } from "@/lib/utils";
import {
  heartbeat,
  markAnnouncementRead,
  recordAttemptEvents,
  saveAnswers,
  submitExam,
} from "@/server/studentExamActions";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  FlagIcon,
  HistoryIcon,
  InfoIcon,
  LayoutGridIcon,
  Loader2Icon,
  LogInIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
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
  instructions?: string | null;
  /** Remaining time computed on the server at render. */
  initialRemainingMs: number;
  questions: Question[];
  savedAnswers: { questionId: string; text: string | null; clientSeq: number }[];
  initialAnnouncements: StudentAnnouncement[];
};

/** Liveness + server clock + announcements. */
const HEARTBEAT_MS = 20_000;
/** Push queued answers this many seconds before the deadline. */
const FINAL_FLUSH_SECONDS = 3;
/** Warn about unsent answers when this close to the deadline. */
const DEADLINE_RISK_SECONDS = 120;
const BLUR_THROTTLE_MS = 5_000;

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
  initialAnnouncements,
}: ExamPlayerProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      savedAnswers.map(({ questionId, text }) => [questionId, text ?? ""]),
    ),
  );
  const [timeLeft, setTimeLeft] = useState(
    Math.ceil(initialRemainingMs / 1000),
  );
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);

  const router = useRouter();
  const online = useOnlineStatus();
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const { flagged, toggle: toggleFlag } = useReviewFlags(
    attemptId,
    questionIds,
  );
  const { role: tabRole, takeOver } = useAttemptTabGuard(attemptId, true);
  const readOnly = tabRole === "blocked" || tabRole === "taken_over";

  const submittingRef = useRef(false);
  const answersRef = useRef(answers);
  /** Deadline on the monotonic `performance.now()` clock; set in effects. */
  const deadlinePerfRef = useRef<number | null>(null);
  const finalFlushDoneRef = useRef(false);
  const seenAnnouncementsRef = useRef(
    new Set(initialAnnouncements.map((a) => a.id)),
  );
  const locallyReadRef = useRef(new Set<string>());
  const questionHeading = useRef<HTMLHeadingElement>(null);

  const [events] = useState(() =>
    createEventBuffer({
      attemptId,
      send: (batch) => recordAttemptEvents(attemptId, batch),
    }),
  );
  const [queue] = useState(() =>
    createAnswerSyncQueue({
      attemptId,
      send: (items) => saveAnswers(attemptId, items),
      onNetworkResult: reportNetworkResult,
    }),
  );
  const sync = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );

  const currentQuestion = questions[currentIndex];
  const answered = questions.filter(({ id }) =>
    isAnsweredText(answers[id]),
  ).length;
  const unanswered = questions.length - answered;
  const unsynced = new Set(sync.pendingQuestionIds);
  const currentFlagged =
    currentQuestion && flagged.includes(currentQuestion.id);
  const locked = timeLeft === 0 || submitting || readOnly;
  const latestUnread = announcements.find((a) => !a.read);

  const goToResult = useCallback(() => {
    clearReviewFlags(attemptId);
    router.replace(`/student/results/${attemptId}` as Route);
  }, [attemptId, router]);

  /** The server finished this attempt (submitted elsewhere or by the deadline). */
  const leaveFinishedAttempt = useCallback(() => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    queue.markClosed("already_submitted");
    void clearAttemptAnswers(attemptId).catch(() => undefined);
    goToResult();
  }, [attemptId, goToResult, queue]);

  const finalize = useCallback(
    async (expired: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setAutoSubmitting(expired);
      setSubmitError("");
      try {
        await queue.whenIdle();
        // After the deadline the server rejects writes anyway; before it,
        // drain the queue so submission carries as little as possible.
        if (!expired) await queue.flushAll();
        const finalItems = queue.getPendingItems().slice(0, MAX_FINAL_ITEMS);
        await submitExam(attemptId, {
          source: expired ? "timer" : "manual",
          ...(finalItems.length > 0 ? { finalItems } : {}),
        });
        queue.markClosed("already_submitted");
        try {
          await clearAttemptAnswers(attemptId);
        } catch {
          // Best-effort cleanup; the server already holds the submission.
        }
        goToResult();
      } catch {
        setSubmitError(
          expired ?
            "Time is up, but submission could not be confirmed. Answers the server already received are kept — retry to finish."
          : "Submission could not be confirmed. Check your connection and try again.",
        );
        setSubmitting(false);
        setAutoSubmitting(false);
        submittingRef.current = false;
      }
    },
    [attemptId, goToResult, queue],
  );

  const finalizeRef = useRef(finalize);
  useEffect(() => {
    finalizeRef.current = finalize;
  }, [finalize]);

  useEffect(() => {
    queue.setHandlers({
      onStale: ({ questionId, text }) => {
        answersRef.current = { ...answersRef.current, [questionId]: text };
        setAnswers(answersRef.current);
        const n = questionIds.indexOf(questionId) + 1;
        toast.warning(
          `Question ${n} was changed in another tab or device. The newer saved copy is shown.`,
        );
        void events.push("sync_conflict", { question: n });
      },
      onClosed: (reason) => {
        if (reason === "deadline_passed") {
          deadlinePerfRef.current = performance.now();
          setTimeLeft(0);
          void finalizeRef.current(true);
        } else if (reason === "already_submitted") {
          leaveFinishedAttempt();
        } else if (reason === "unauthorized") {
          setSessionEnded(true);
        }
      },
    });
  });

  useEffect(() => {
    queue.start();
    return () => queue.stop();
  }, [queue]);

  // Merge the server copy with this device's copy. Local edits the server
  // never acknowledged (offline, then refreshed) are restored and re-sent with
  // their original sequence, so a lost response cannot create a duplicate.
  useEffect(() => {
    let cancelled = false;
    const server = savedAnswers.map(({ questionId, clientSeq, text }) => ({
      questionId,
      clientSeq,
      text,
    }));
    const known = new Set(questionIds);
    const restore = async () => {
      let recovered: LocalAnswer[] = [];
      try {
        recovered = (await seedSeqFromServer(attemptId, server)).filter((r) =>
          known.has(r.questionId),
        );
      } catch {
        recovered = [];
      }
      if (cancelled) return;
      const accepted = queue.prime({ server, recovered });
      if (accepted.length > 0) {
        const next = { ...answersRef.current };
        for (const row of accepted) next[row.questionId] = row.text;
        answersRef.current = next;
        setAnswers(next);
        setRecoveredCount(accepted.length);
        void queue.flush();
      }
      if (server.length > 0 || accepted.length > 0)
        void events.push("resumed_after_refresh", { recovered: accepted.length });
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [attemptId, events, queue, questionIds, savedAnswers]);

  // Countdown on the monotonic clock, seeded from server-computed remaining
  // time. Server corrections may only move the deadline earlier.
  useEffect(() => {
    if (deadlinePerfRef.current === null)
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
        void queue.retryNow();
      }
      if (seconds === 0) {
        window.clearInterval(interval);
        void finalizeRef.current(true);
      }
    };
    const interval = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(interval);
  }, [initialRemainingMs, queue]);

  const applyAnnouncements = useCallback((list: StudentAnnouncement[]) => {
    for (const a of list) {
      if (seenAnnouncementsRef.current.has(a.id)) continue;
      seenAnnouncementsRef.current.add(a.id);
      if (a.read) continue;
      const notify = a.priority === "urgent" ? toast.error : toast.info;
      notify(a.priority === "urgent" ? "Urgent announcement" : "New announcement", {
        description: a.message,
      });
    }
    setAnnouncements(
      list.map((a) =>
        locallyReadRef.current.has(a.id) ? { ...a, read: true } : a,
      ),
    );
  }, []);

  // Heartbeat: liveness for proctors, authoritative remaining time,
  // announcements, and server-side finalisation once the deadline passes.
  useEffect(() => {
    let cancelled = false;
    let running = false;
    const beat = async () => {
      if (running || submittingRef.current) return;
      running = true;
      try {
        const res = await heartbeat({
          attemptId,
          online: isEffectivelyOnline(),
          pendingLocal: queue.getSnapshot().pendingCount,
          visible: document.visibilityState === "visible",
        });
        reportNetworkResult(true);
        if (cancelled) return;
        if (!res.ok) {
          if (res.reason === "unauthorized") setSessionEnded(true);
          return;
        }
        setSessionEnded(false);
        queue.reopen();
        applyAnnouncements(res.announcements);
        if (res.status !== "in_progress") {
          leaveFinishedAttempt();
          return;
        }
        const serverDeadline = performance.now() + res.remainingMs;
        deadlinePerfRef.current = Math.min(
          deadlinePerfRef.current ?? serverDeadline,
          serverDeadline,
        );
        if (res.remainingMs > FINAL_FLUSH_SECONDS * 1000)
          finalFlushDoneRef.current = false;
        void saveClockMeta(attemptId, {
          lastServerNow: res.serverNow,
          lastRemainingMs: res.remainingMs,
          lastOnlineAt: Date.now(),
        }).catch(() => undefined);
        void events.flush();
      } catch {
        reportNetworkResult(false);
      } finally {
        running = false;
      }
    };
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      void beat();
      void queue.retryNow();
    };
    const interval = window.setInterval(() => void beat(), HEARTBEAT_MS);
    void beat();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [applyAnnouncements, attemptId, events, leaveFinishedAttempt, queue]);

  // Workspace signals for staff. Informational only — never proof of misconduct.
  useEffect(() => {
    let lastBlur = -Infinity;
    const onOffline = () => {
      queue.notifyConnectivity();
      void events.push("connection_lost");
    };
    const onOnline = () => {
      queue.notifyConnectivity();
      void events.push("connection_restored");
    };
    const onVisibility = () => {
      if (submittingRef.current) return;
      void events.push(
        document.visibilityState === "visible" ? "tab_visible" : "tab_hidden",
      );
    };
    const onBlur = () => {
      if (submittingRef.current || document.visibilityState !== "visible") return;
      const t = performance.now();
      if (t - lastBlur < BLUR_THROTTLE_MS) return;
      lastBlur = t;
      void events.push("window_blur");
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [events, queue]);

  useEffect(() => {
    if (tabRole === "blocked" || tabRole === "taken_over")
      void events.push("multiple_tabs", { role: tabRole });
  }, [events, tabRole]);

  const syncState = sync.state;
  const prevSyncStateRef = useRef(syncState);
  useEffect(() => {
    if (syncState === "error" && prevSyncStateRef.current !== "error")
      void events.push("sync_failed", {
        pending: queue.getSnapshot().pendingCount,
      });
    prevSyncStateRef.current = syncState;
  }, [events, queue, syncState]);

  // Time ran out while offline: finish as soon as the connection is back.
  useEffect(() => {
    if (online && timeLeft === 0 && submitError && !submittingRef.current)
      void finalizeRef.current(true);
  }, [online, timeLeft, submitError]);

  // Without IndexedDB the only copy of unsent answers is this page.
  const unsafeToLeave = sync.pendingCount > 0 && !sync.storageAvailable;
  useEffect(() => {
    if (!unsafeToLeave) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsafeToLeave]);

  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) locallyReadRef.current.add(id);
    setAnnouncements((list) =>
      list.map((a) => (ids.includes(a.id) ? { ...a, read: true } : a)),
    );
    for (const id of ids) void markAnnouncementRead(id).catch(() => undefined);
  };

  const goTo = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    setNavigatorOpen(false);
    if (index === currentIndex) return;
    void queue.flush();
    setCurrentIndex(index);
    if (!navigatorOpen)
      window.requestAnimationFrame(() => questionHeading.current?.focus());
  };

  const changeAnswer = (id: string, text: string) => {
    if (locked) return;
    answersRef.current = { ...answersRef.current, [id]: text };
    setAnswers(answersRef.current);
    void queue.enqueue(id, text);
  };

  const deadlineLabel =
    timeLeft === 0 ? "Time expired"
    : timeLeft <= 60 ? "Final minute"
    : timeLeft <= 300 ? "Five minutes or less"
    : "Time remaining";
  const deadlineRisk =
    timeLeft > 0 &&
    timeLeft <= DEADLINE_RISK_SECONDS &&
    sync.pendingCount > 0 &&
    (!online ||
      sync.state === "offline" ||
      sync.state === "retrying" ||
      sync.state === "error");

  const questionNavigation = (
    <nav
      aria-label="Question navigation"
      className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
      {questions.map((question, index) => {
        const isAnswered = isAnsweredText(answers[question.id]);
        const isFlagged = flagged.includes(question.id);
        const isUnsynced = unsynced.has(question.id);
        return (
          <button
            key={question.id}
            type="button"
            disabled={submitting}
            aria-current={index === currentIndex ? "step" : undefined}
            aria-label={`Question ${index + 1}, ${isAnswered ? "answered" : "unanswered"}${isFlagged ? ", marked for review" : ""}${isUnsynced ? ", not yet saved to the server" : ""}`}
            onClick={() => goTo(index)}
            className={cn(
              "hover:bg-accent relative grid min-h-11 place-items-center rounded-md border font-mono text-sm transition-colors focus-visible:outline-2",
              isAnswered ?
                "border-primary/45 bg-secondary text-secondary-foreground"
              : "border-input bg-card",
              index === currentIndex && "border-primary ring-primary ring-1",
            )}>
            {index + 1}
            {isAnswered && (
              <CheckIcon
                aria-hidden="true"
                className="text-success absolute bottom-0.5 left-0.5 size-3"
              />
            )}
            {isFlagged && (
              <FlagIcon
                aria-hidden="true"
                className="text-warning absolute top-0.5 right-0.5 size-3"
              />
            )}
            {isUnsynced && (
              <span
                aria-hidden="true"
                data-unsynced
                className="bg-warning absolute top-1 left-1 size-1.5 rounded-full"
              />
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <section className="grid min-h-dvh grid-rows-[auto_1fr_auto]">
      <header className="bg-card sticky top-0 z-10 border-b">
        <div className="mx-auto flex min-h-16 w-full max-w-[80rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="hidden sm:inline-flex [&_[data-brand-name]]:hidden" />
            <h1 className="min-w-0 text-sm! font-semibold! break-words sm:text-lg!">
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
            <AnnouncementsButton
              announcements={announcements}
              onOpen={() =>
                markRead(announcements.filter((a) => !a.read).map((a) => a.id))
              }
            />
          </div>
          <div
            className={cn(
              "flex min-w-28 shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 sm:px-3",
              timeLeft <= 60 ? "bg-error-surface text-destructive"
              : timeLeft <= 300 ? "bg-warning-surface text-warning"
              : "bg-secondary text-secondary-foreground",
            )}>
            <ClockIcon
              aria-hidden="true"
              className="size-4"
            />
            <div className="grid gap-0.5">
              <span
                role="status"
                className="text-[11px] leading-tight font-medium">
                {deadlineLabel}
              </span>
              <span
                role="timer"
                aria-label="Time remaining"
                className="font-mono text-xl leading-none font-semibold tabular-nums">
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
              <span
                id="question-progress"
                className="font-semibold">
                {answered} of {questions.length} answered
              </span>
              <SyncStatusIndicator
                snapshot={sync}
                onRetry={() => void queue.retryNow()}
              />
            </div>
            <progress
              aria-labelledby="question-progress"
              max={Math.max(1, questions.length)}
              value={answered}
              className="exam-progress h-2 w-full overflow-hidden rounded-full"
            />
          </div>

          {readOnly && (
            <div
              role="alert"
              className="bg-warning-surface text-warning flex flex-wrap items-center gap-3 rounded-md px-4 py-3 text-sm">
              <CopyIcon
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              <p className="min-w-0 flex-1">
                {tabRole === "taken_over" ?
                  "This exam was opened in another tab, so editing is paused here."
                : "This exam is already open in another tab. Editing is paused here to avoid conflicting answers."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={takeOver}>
                Use this tab instead
              </Button>
            </div>
          )}

          {sessionEnded && (
            <div
              role="alert"
              className="bg-error-surface text-destructive flex flex-wrap items-center gap-3 rounded-md px-4 py-3 text-sm">
              <LogInIcon
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              <p className="min-w-0 flex-1">
                Your session has ended. Answers are kept on this device — sign
                in again in a new tab and saving resumes here automatically.
              </p>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4">
                Sign in
              </a>
            </div>
          )}

          {deadlineRisk && (
            <p
              role="alert"
              className="bg-error-surface text-destructive flex items-start gap-2 rounded-md px-4 py-3 text-sm">
              <WifiOffIcon
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              Less than {Math.ceil(DEADLINE_RISK_SECONDS / 60)} minutes left
              and {sync.pendingCount}{" "}
              {sync.pendingCount === 1 ? "answer has" : "answers have"} not
              reached the server. Reconnect now — answers that arrive after the
              deadline cannot be accepted.
            </p>
          )}

          {recoveredCount > 0 && (
            <div
              role="status"
              className="bg-secondary text-secondary-foreground flex items-start gap-3 rounded-md px-4 py-3 text-sm">
              <HistoryIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <p className="min-w-0 flex-1">
                Recovered {recoveredCount}{" "}
                {recoveredCount === 1 ? "answer" : "answers"} saved on this
                device that had not reached the server. They are being sent
                now.
              </p>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Dismiss"
                onClick={() => setRecoveredCount(0)}>
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          )}

          {latestUnread && (
            <AnnouncementBanner
              announcement={latestUnread}
              onDismiss={(id) => markRead([id])}
            />
          )}

          {autoSubmitting && !submitError && (
            <p
              role="status"
              className="bg-warning-surface text-warning flex items-center gap-2 rounded-md px-4 py-3 text-sm">
              <Loader2Icon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Time is up — submitting your saved answers…
            </p>
          )}

          {submitError && (
            <p
              role="alert"
              className="bg-error-surface text-destructive flex items-start gap-2 rounded-md px-4 py-3 text-sm">
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              {submitError}
            </p>
          )}

          {currentQuestion ?
            <fieldset
              disabled={locked}
              className="bg-card min-w-0 rounded-lg border p-5 shadow-sm sm:p-6 lg:p-8">
              <h2
                ref={questionHeading}
                tabIndex={-1}
                className="text-primary mb-4 text-sm font-semibold focus:outline-none">
                Question {currentIndex + 1} of {questions.length}
              </h2>
              <QuestionCard
                key={currentQuestion.id}
                question={currentQuestion}
                value={answers[currentQuestion.id] ?? ""}
                onChange={(text) => changeAnswer(currentQuestion.id, text)}
              />
            </fieldset>
          : <p className="bg-card text-muted-foreground rounded-lg border p-6">
              This examination has no questions.
            </p>
          }

          <DigitalScratchpad attemptId={attemptId} />

          <div className="flex flex-wrap items-center gap-2">
            {currentQuestion && (
              <Button
                variant="outline"
                type="button"
                disabled={locked}
                aria-pressed={Boolean(currentFlagged)}
                className={cn(
                  currentFlagged &&
                    "border-warning bg-warning-surface text-warning",
                )}
                onClick={() => toggleFlag(currentQuestion.id)}>
                <FlagIcon aria-hidden="true" />
                {currentFlagged ? "Marked for review" : "Mark for review"}
              </Button>
            )}
            <Sheet
              open={navigatorOpen}
              onOpenChange={setNavigatorOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    className="md:hidden"
                  />
                }>
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

        <aside className="bg-card hidden min-w-0 self-start rounded-lg border p-4 md:grid md:gap-4 lg:p-5">
          <div className="grid gap-1">
            <h2 className="font-semibold">Questions</h2>
            <p className="text-muted-foreground text-sm">
              {flagged.length} marked for review
            </p>
          </div>
          {questionNavigation}
        </aside>
      </div>

      <footer className="bg-card sticky bottom-0 border-t">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0 || submitting}>
              <ChevronLeftIcon aria-hidden="true" /> Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= questions.length - 1 || submitting}>
              Next <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>

          {timeLeft === 0 ?
            <Button
              onClick={() => void finalize(true)}
              disabled={submitting}>
              {submitting ?
                <>
                  <Loader2Icon
                    className="animate-spin"
                    aria-hidden="true"
                  />{" "}
                  Submitting…
                </>
              : "Retry submission"}
            </Button>
          : <Dialog
              open={reviewOpen}
              onOpenChange={setReviewOpen}>
              <DialogTrigger
                render={<Button disabled={submitting || readOnly} />}>
                {submitting ?
                  <>
                    <Loader2Icon
                      className="animate-spin"
                      aria-hidden="true"
                    />{" "}
                    Submitting…
                  </>
                : "Review & submit"}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit examination?</DialogTitle>
                  <DialogDescription>
                    After submission, you cannot change your answers.
                  </DialogDescription>
                </DialogHeader>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-secondary rounded-md p-3">
                    <dt className="text-muted-foreground text-xs">Answered</dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {answered}
                    </dd>
                  </div>
                  <div className="bg-muted rounded-md p-3">
                    <dt className="text-muted-foreground text-xs">
                      Unanswered
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {unanswered}
                    </dd>
                  </div>
                  <div className="bg-warning-surface rounded-md p-3">
                    <dt className="text-muted-foreground text-xs">
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
                            }}>
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
                {(!online || sync.pendingCount > 0) && (
                  <p className="bg-warning-surface text-warning flex items-start gap-2 rounded-md px-3 py-2 text-sm">
                    <WifiOffIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {online ?
                      `${sync.pendingCount} ${sync.pendingCount === 1 ? "answer is" : "answers are"} still saving. ${sync.pendingCount === 1 ? "It" : "They"} will be sent with your submission.`
                    : "You are offline. Submission needs a connection — your answers stay on this device until then."}
                  </p>
                )}
                <DialogFooter showCloseButton>
                  <DialogClose
                    render={
                      <Button onClick={() => void finalize(timeLeft === 0)} />
                    }>
                    Submit examination
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        </div>
      </footer>
    </section>
  );
};
