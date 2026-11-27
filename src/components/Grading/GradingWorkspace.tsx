"use client";

import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { Textarea } from "@/components/shadcnui/textarea";
import { formatScore } from "@/lib/exam/grading";
import { cn } from "@/lib/utils";
import { SCORE_STEP, manualGradeSchema, type ManualGradeFormType } from "@/lib/zodSchema";
import {
  approveAiGrade,
  loadGradingQueue,
  overrideAutoScore,
  retryAiGrading,
  saveManualGrade,
  type GradingQueue,
  type GradingQueueItem,
} from "@/server/gradingActions";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  SaveIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

type AiFeedbackPayload = {
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  criterionFeedback?: Array<{
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>;
  needsReview?: boolean;
  decision?: string;
};

const parseAiFeedback = (raw: string | null | undefined): AiFeedbackPayload | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiFeedbackPayload;
  } catch {
    return { summary: raw };
  }
};

const AiAssistPanel = ({
  item,
  locked,
  onApproved,
  onRetried,
}: {
  item: GradingQueueItem;
  locked: boolean;
  onApproved: (update: Partial<GradingQueueItem>) => void;
  onRetried: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const ai = parseAiFeedback(item.aiFeedback);
  if (item.kind !== "manual" && item.kind !== "blank") return null;
  if (
    !item.aiScore &&
    !item.aiFeedback &&
    item.gradingStatus !== "failed" &&
    item.gradingSource !== "unavailable" &&
    item.gradingStatus !== "processing"
  ) {
    return (
      <div className="border-border bg-muted/20 grid gap-2 rounded-2xl border p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <SparklesIcon className="size-4" /> AI-assisted grading
        </p>
        <p className="text-muted-foreground text-xs">
          {item.gradingSource === "pending_manual" ||
          item.gradingSource === "unavailable" ?
            "AI unavailable — mark this answer manually."
          : "Waiting for AI provisional score (or mark manually)."}
        </p>
        {!locked && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void retryAiGrading(item.answerId)
                .then((res) => {
                  if (!res.ok) return toast.error(res.error);
                  toast.success("AI retry finished");
                  onRetried();
                })
                .finally(() => setBusy(false));
            }}>
            {busy ?
              <Loader2Icon className="size-4 animate-spin" />
            : <RefreshCwIcon className="size-4" />}
            Retry AI grading
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/20 grid gap-3 rounded-2xl border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <SparklesIcon className="size-4" />
          {item.gradingStatus === "examiner_reviewed" ?
            "Examiner reviewed"
          : item.gradingStatus === "failed" ?
            "AI failed"
          : item.gradingStatus === "ai_graded" ?
            "AI-assisted"
          : "Needs review"}
        </p>
        <span className="text-muted-foreground text-xs">
          {item.aiScore != null ?
            `AI ${formatScore(item.aiScore)}/${item.points}`
          : null}
          {item.aiConfidence != null ?
            ` · confidence ${Math.round(item.aiConfidence * 100)}%`
          : null}
        </span>
      </div>
      {item.aiErrorMessage ?
        <p className="text-destructive text-xs">{item.aiErrorMessage}</p>
      : null}
      {ai?.summary ?
        <p className="whitespace-pre-wrap">{ai.summary}</p>
      : null}
      {ai?.strengths && ai.strengths.length > 0 ?
        <div>
          <p className="text-muted-foreground text-xs">Strengths</p>
          <ul className="list-disc pl-5">
            {ai.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      : null}
      {ai?.improvements && ai.improvements.length > 0 ?
        <div>
          <p className="text-muted-foreground text-xs">Improvements</p>
          <ul className="list-disc pl-5">
            {ai.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      : null}
      {ai?.criterionFeedback && ai.criterionFeedback.length > 0 ?
        <ul className="grid gap-1">
          {ai.criterionFeedback.map((c) => (
            <li
              key={c.criterion}
              className="text-xs">
              <span className="font-medium">{c.criterion}</span>: {c.score}/
              {c.maxScore} — {c.feedback}
            </li>
          ))}
        </ul>
      : null}
      {!locked && item.state === "pending" ?
        <div className="flex flex-wrap gap-2">
          {item.aiScore != null ?
            <Button
              type="button"
              size="lg"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void approveAiGrade(item.answerId)
                  .then((res) => {
                    if (!res.ok) return toast.error(res.error);
                    toast.success("AI grade approved");
                    onApproved({
                      manualScore: res.data.manualScore,
                      score: res.data.score,
                      feedback: res.data.feedback,
                      gradedAt: res.data.gradedAt,
                      gradedBy: res.data.gradedBy,
                      state: "graded",
                      gradingStatus: "examiner_reviewed",
                      gradingSource: "examiner",
                      attemptStatus: res.data.attempt.status,
                    });
                  })
                  .finally(() => setBusy(false));
              }}>
              {busy ?
                <Loader2Icon className="size-4 animate-spin" />
              : <SparklesIcon className="size-4" />}
              Approve AI grade
            </Button>
          : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void retryAiGrading(item.answerId)
                .then((res) => {
                  if (!res.ok) return toast.error(res.error);
                  toast.success("AI retry finished");
                  onRetried();
                })
                .finally(() => setBusy(false));
            }}>
            <RefreshCwIcon className="size-4" /> Retry AI
          </Button>
        </div>
      : null}
    </div>
  );
};

type StatusFilter = "pending" | "graded" | "all";
type GroupBy = "question" | "candidate";

const TYPE_LABEL: Record<string, string> = {
  long_answer: "Long answer",
  short_answer: "Short answer",
  multiple_choice: "Multiple select",
  single_choice: "Single choice",
  true_false: "True / false",
};

const candidateName = (item: GradingQueueItem) =>
  item.candidate.name ?? item.candidate.label;

const MarkForm = ({
  item,
  locked,
  onSaved,
}: {
  item: GradingQueueItem;
  locked: boolean;
  onSaved: (updated: Partial<GradingQueueItem>, next: boolean) => void;
}) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ManualGradeFormType>({
    resolver: zodResolver(manualGradeSchema),
    defaultValues: {
      answerId: item.answerId,
      score:
        item.manualScore ??
        item.aiScore ??
        (item.blank ? 0 : ""),
      feedback: item.feedback ?? "",
    },
    mode: "all",
  });

  const submit = (next: boolean) =>
    handleSubmit(async (values) => {
      const res = await saveManualGrade(values).catch(() => null);
      if (!res) return void toast.error("Could not save the mark. Check your connection.");
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        res.data.attempt.status === "graded" ?
          `Saved — ${candidateName(item)} is fully graded (${formatScore(res.data.attempt.totalScore)})`
        : "Mark saved",
      );
      onSaved(
        {
          manualScore: res.data.manualScore,
          score: res.data.score,
          feedback: res.data.feedback,
          gradedAt: res.data.gradedAt,
          gradedBy: res.data.gradedBy,
          state: "graded",
          attemptStatus: res.data.attempt.status,
        },
        next,
      );
    });

  return (
    <form
      noValidate
      onSubmit={submit(true)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void submit(true)();
        }
      }}
      className="grid gap-4">
      <fieldset
        disabled={locked || isSubmitting}
        className="grid gap-4">
        <Controller
          name="score"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="grade-score">
                Score (0–{item.points}, steps of {SCORE_STEP})
              </FieldLabel>
              <Input
                {...field}
                id="grade-score"
                type="number"
                inputMode="decimal"
                min={0}
                max={item.points}
                step={SCORE_STEP}
                value={String(field.value ?? "")}
                aria-invalid={fieldState.invalid}
                className="max-w-40"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="feedback"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="grade-feedback">Feedback for the candidate (optional)</FieldLabel>
              <Textarea
                {...field}
                id="grade-feedback"
                rows={4}
                maxLength={2000}
                value={field.value ?? ""}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={locked || isSubmitting}>
          {isSubmitting ?
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
          : <SaveIcon aria-hidden="true" />}
          Save &amp; next
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={locked || isSubmitting}
          onClick={() => void submit(false)()}>
          Save
        </Button>
        <span className="text-muted-foreground text-xs">Ctrl+Enter saves and moves on</span>
      </div>
    </form>
  );
};

const OverrideForm = ({
  item,
  locked,
  onSaved,
}: {
  item: GradingQueueItem;
  locked: boolean;
  onSaved: (updated: Partial<GradingQueueItem>) => void;
}) => {
  const [score, setScore] = useState(String(item.manualScore ?? item.autoScore ?? ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (value: string | null) => {
    setBusy(true);
    const res = await overrideAutoScore({
      answerId: item.answerId,
      score: value,
      reason,
    }).catch(() => null);
    setBusy(false);
    if (!res) return toast.error("Could not save. Check your connection.");
    if (!res.ok) return toast.error(res.error);
    toast.success(value === null ? "Automatic score restored" : "Override saved");
    setReason("");
    onSaved({
      manualScore: res.data.manualScore,
      score: res.data.score,
      gradedAt: res.data.gradedAt,
      gradedBy: res.data.gradedBy,
      attemptStatus: res.data.attempt.status,
    });
  };

  return (
    <fieldset
      disabled={locked || busy}
      className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="override-score">Override score (0–{item.points})</FieldLabel>
        <Input
          id="override-score"
          type="number"
          min={0}
          max={item.points}
          step={SCORE_STEP}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="max-w-40"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="override-reason">Reason (required, kept in the history)</FieldLabel>
        <Textarea
          id="override-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          onClick={() => void send(score)}>
          {busy ?
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
          : <SaveIcon aria-hidden="true" />}
          Save override
        </Button>
        {item.manualScore != null && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => void send(null)}>
            <Undo2Icon aria-hidden="true" />
            Restore automatic score ({formatScore(item.autoScore)})
          </Button>
        )}
      </div>
    </fieldset>
  );
};

export const GradingWorkspace = ({ initial }: { initial: GradingQueue }) => {
  const examId = initial.exam.id;
  const locked = Boolean(initial.exam.resultsPublishedAt);
  const [items, setItems] = useState(initial.items);
  const [status, setStatus] = useState<StatusFilter>(
    initial.summary.pending > 0 ? "pending" : "all",
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(initial.options.by);
  const [anonymize, setAnonymize] = useState(initial.options.anonymize);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = items
    .filter((i) => status === "all" || i.state === status)
    .sort((a, b) =>
      groupBy === "question" ?
        a.questionNumber - b.questionNumber ||
        a.candidate.label.localeCompare(b.candidate.label, undefined, { numeric: true })
      : a.candidate.label.localeCompare(b.candidate.label, undefined, { numeric: true }) ||
        a.questionNumber - b.questionNumber,
    );
  const current = visible.find((i) => i.answerId === selectedId) ?? visible[0] ?? null;
  const index = current ? visible.indexOf(current) : -1;
  const pending = items.filter((i) => i.state === "pending").length;
  const graded = items.length - pending;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      const next = visible[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) setSelectedId(next.answerId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, visible]);

  const toggleAnonymize = async () => {
    setLoading(true);
    const res = await loadGradingQueue(examId, { anonymize: !anonymize }).catch(() => null);
    setLoading(false);
    if (!res?.ok) return toast.error(res?.error ?? "Could not reload the queue");
    setAnonymize(!anonymize);
    setItems(res.data.items);
  };

  const applyUpdate = (answerId: string, update: Partial<GradingQueueItem>, advance: boolean) => {
    const nextItem = advance ? visible[index + 1] : undefined;
    setItems((prev) => prev.map((i) => (i.answerId === answerId ? { ...i, ...update } : i)));
    if (advance) setSelectedId(nextItem?.answerId ?? null);
    else setSelectedId(answerId);
  };

  return (
    <div className="grid gap-6">
      {locked && (
        <p className="bg-warning-surface text-warning flex items-center gap-2 rounded-md px-4 py-3 text-sm">
          <LockIcon
            aria-hidden="true"
            className="size-4"
          />
          Results are published, so marks are locked. Withdraw results on the
          results page to change marks.
        </p>
      )}
      {initial.summary.inProgress > 0 && (
        <p className="text-muted-foreground text-sm">
          {initial.summary.inProgress} candidate
          {initial.summary.inProgress === 1 ? " is" : "s are"} still writing; their
          answers appear here after they submit.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p
          className="text-sm font-medium tabular-nums"
          role="status"
          data-testid="grading-progress">
          {graded} of {items.length} marked · {pending} pending
        </p>
        <progress
          max={Math.max(1, items.length)}
          value={graded}
          aria-label="Marking progress"
          className="exam-progress h-2 w-40 overflow-hidden rounded-full"
        />
        <div
          role="group"
          aria-label="Show"
          className="ml-auto flex flex-wrap gap-1.5">
          {(["pending", "graded", "all"] as const).map((s) => (
            <Button
              key={s}
              size="lg"
              variant={status === s ? "default" : "outline"}
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setSelectedId(null);
              }}>
              {s === "pending" ? "Pending" : s === "graded" ? "Marked" : "All"}
            </Button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Group by"
          className="flex gap-1.5">
          {(["question", "candidate"] as const).map((g) => (
            <Button
              key={g}
              size="lg"
              variant={groupBy === g ? "default" : "outline"}
              aria-pressed={groupBy === g}
              onClick={() => setGroupBy(g)}>
              By {g}
            </Button>
          ))}
        </div>
        <Button
          size="lg"
          variant="outline"
          aria-pressed={anonymize}
          disabled={loading}
          onClick={toggleAnonymize}>
          {loading && (
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
          )}
          {anonymize ? "Show names" : "Hide names"}
        </Button>
      </div>

      {items.length === 0 ?
        <p className="text-muted-foreground rounded-lg border px-4 py-10 text-center text-sm">
          Nothing to mark. Written answers and score overrides appear here once
          candidates submit.
        </p>
      : <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav
            aria-label="Answers to mark"
            className="max-h-[70vh] overflow-y-auto rounded-lg border">
            {visible.length === 0 && (
              <p className="text-muted-foreground p-4 text-sm">No answers in this view.</p>
            )}
            <ul>
              {visible.map((item) => (
                <li key={item.answerId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.answerId)}
                    aria-current={current?.answerId === item.answerId ? "true" : undefined}
                    className={cn(
                      "hover:bg-muted/60 grid w-full gap-0.5 border-b px-3 py-2 text-left text-sm",
                      current?.answerId === item.answerId && "bg-muted",
                    )}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {groupBy === "question" ?
                          `Q${item.questionNumber} · ${candidateName(item)}`
                        : `${candidateName(item)} · Q${item.questionNumber}`}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 text-[11px]",
                          item.state === "pending" ?
                            "bg-warning-surface text-warning"
                          : "bg-success-surface text-success",
                        )}>
                        {item.state === "pending" ?
                          "Pending"
                        : `${formatScore(item.score)}/${item.points}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {item.kind === "override" ?
                        "Override"
                      : item.kind === "blank" ?
                        "Blank — confirm"
                      : TYPE_LABEL[item.questionType]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {current ?
            <section
              aria-labelledby="grading-current"
              className="grid content-start gap-5 rounded-lg border p-5"
              data-answer-id={current.answerId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2
                    id="grading-current"
                    className="text-lg font-medium">
                    Question {current.questionNumber} · {candidateName(current)}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {TYPE_LABEL[current.questionType]} · {current.points} point
                    {current.points === 1 ? "" : "s"}
                    {current.gradedBy &&
                      ` · last marked by ${current.gradedBy}`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label="Previous answer (Alt+Up)"
                    disabled={index <= 0}
                    onClick={() => setSelectedId(visible[index - 1]?.answerId ?? null)}>
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label="Next answer (Alt+Down)"
                    disabled={index >= visible.length - 1}
                    onClick={() => setSelectedId(visible[index + 1]?.answerId ?? null)}>
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <p className="font-medium break-words whitespace-pre-wrap">{current.questionText}</p>

              {current.options.length > 0 && (
                <ul className="text-muted-foreground grid gap-1 text-sm">
                  {current.options.map((o) => (
                    <li key={o}>• {o}</li>
                  ))}
                </ul>
              )}

              <div className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Candidate answer</span>
                <p
                  className={cn(
                    "bg-muted/40 max-h-96 overflow-y-auto rounded-md border px-3 py-2 break-words whitespace-pre-wrap",
                    current.blank && "text-muted-foreground italic",
                  )}>
                  {current.blank ? "No answer" : current.text}
                </p>
              </div>

              {current.guidance && (
                <div className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">
                    {current.kind === "override" ? "Answer key" : "Marking guidance"}
                  </span>
                  <p className="bg-success-surface text-success rounded-md px-3 py-2 whitespace-pre-wrap">
                    {current.guidance}
                  </p>
                </div>
              )}

              {current.detail && (
                <p className="text-muted-foreground text-xs">
                  Automatic marking: {current.detail.correctSelected} correct selected,{" "}
                  {current.detail.wrongSelected} wrong selected, {current.detail.missed} missed ·
                  automatic score {formatScore(current.autoScore)}
                </p>
              )}

              {(current.kind === "manual" || current.kind === "blank") && (
                <AiAssistPanel
                  key={`ai-${current.answerId}-${current.aiGradedAt ?? ""}`}
                  item={current}
                  locked={locked}
                  onApproved={(u) => applyUpdate(current.answerId, u, false)}
                  onRetried={() => {
                    void loadGradingQueue(examId, { anonymize }).then((res) => {
                      if (res.ok) setItems(res.data.items);
                    });
                  }}
                />
              )}

              {current.kind === "override" ?
                <OverrideForm
                  key={current.answerId}
                  item={current}
                  locked={locked}
                  onSaved={(u) => applyUpdate(current.answerId, u, false)}
                />
              : <MarkForm
                  key={current.answerId}
                  item={current}
                  locked={locked}
                  onSaved={(u, next) => applyUpdate(current.answerId, u, next)}
                />
              }
            </section>
          : <p className="text-muted-foreground rounded-lg border p-6 text-sm">
              All answers in this view are marked.
            </p>
          }
        </div>
      }
    </div>
  );
};
