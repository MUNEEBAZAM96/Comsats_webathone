"use client";

import { format } from "date-fns";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  FileQuestionIcon,
} from "lucide-react";
import { useState } from "react";
import type { PublishIssue } from "@/lib/exam/publishReadiness";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import type { BuilderStep } from "./questionLabels";

type ExamBuilderSummaryProps = {
  title: string;
  status: string;
  questionCount: number;
  totalMarks: number;
  duration: number;
  startTime?: string | null;
  endTime?: string | null;
  issues: PublishIssue[];
  saveState: "idle" | "saving" | "saved" | "error";
  onGoToStep: (step: BuilderStep) => void;
  onGoToQuestion?: (questionId: string) => void;
};

const formatWhen = (value?: string | null) => {
  if (!value) return "Not set";
  try {
    return format(new Date(value), "MMM d, yyyy HH:mm");
  } catch {
    return "Not set";
  }
};

const ExamBuilderSummary = ({
  title,
  status,
  questionCount,
  totalMarks,
  duration,
  startTime,
  endTime,
  issues,
  saveState,
  onGoToStep,
  onGoToQuestion,
}: ExamBuilderSummaryProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const ready = issues.length === 0 && questionCount > 0;

  const body = (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Exam summary
        </p>
        <p className="font-medium wrap-anywhere">{title || "Untitled exam"}</p>
        <Badge variant={status === "draft" ? "secondary" : "default"}>
          {status}
        </Badge>
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground flex items-center gap-2">
            <FileQuestionIcon className="size-4" /> Questions
          </dt>
          <dd className="font-medium">{questionCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Total marks</dt>
          <dd className="font-medium">{totalMarks}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground flex items-center gap-2">
            <ClockIcon className="size-4" /> Duration
          </dt>
          <dd className="font-medium">{duration} min</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-muted-foreground">Start</dt>
          <dd className="font-medium">{formatWhen(startTime)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-muted-foreground">End</dt>
          <dd className="font-medium">{formatWhen(endTime)}</dd>
        </div>
      </dl>

      <div
        className="border-border grid gap-2 rounded-2xl border p-3"
        aria-live="polite">
        <p className="text-xs font-medium tracking-wide uppercase">
          {saveState === "saving" ?
            "Saving…"
          : saveState === "saved" ?
            "Saved"
          : saveState === "error" ?
            "Save failed"
          : "Ready"}
        </p>
        {ready ?
          <p className="text-success flex items-center gap-2 text-sm">
            <CheckCircle2Icon className="size-4" /> Ready to publish
          </p>
        : <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <AlertTriangleIcon className="size-4" />
            {issues.length} item{issues.length === 1 ? "" : "s"} left before publish
          </p>
        }
      </div>

      {issues.length > 0 ?
        <ul className="grid gap-2">
          {issues.slice(0, 8).map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground w-full rounded-xl text-left text-sm underline-offset-2 hover:underline"
                onClick={() => {
                  onGoToStep(issue.step);
                  if (issue.questionId) onGoToQuestion?.(issue.questionId);
                }}>
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      : null}
    </div>
  );

  return (
    <>
      <aside className="border-border bg-card sticky top-20 hidden h-fit rounded-3xl border p-5 lg:block">
        {body}
      </aside>

      <div className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full justify-between"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}>
          <span>
            {questionCount} questions · {totalMarks} marks
            {ready ? " · Ready" : ` · ${issues.length} left`}
          </span>
          <ChevronDownIcon
            className={`size-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
          />
        </Button>
        {mobileOpen ? <div className="mt-3 max-h-72 overflow-y-auto">{body}</div> : null}
      </div>
    </>
  );
};

export default ExamBuilderSummary;
