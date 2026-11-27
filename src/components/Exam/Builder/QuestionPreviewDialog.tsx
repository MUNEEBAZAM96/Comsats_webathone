"use client";

import { splitLines } from "@/lib/exam/markingScheme";
import { EyeIcon, PencilIcon } from "lucide-react";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
  type BuilderQuestion,
} from "./questionLabels";

type QuestionPreviewDialogProps = {
  question: BuilderQuestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  /** When true, show staff-only answer key beneath the candidate preview. */
  showStaffKey?: boolean;
};

const QuestionPreviewDialog = ({
  question,
  open,
  onOpenChange,
  onEdit,
  showStaffKey = true,
}: QuestionPreviewDialogProps) => {
  if (!question) return null;

  const options = splitLines(question.options);
  const isChoice =
    question.type === "multiple_choice" ||
    question.type === "single_choice" ||
    question.type === "true_false";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeIcon className="size-4" /> Candidate preview
          </DialogTitle>
          <DialogDescription>
            How this question appears to students. Answer keys stay hidden in the
            candidate view.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {QUESTION_TYPE_LABEL[question.type] ?? question.type}
            </Badge>
            <Badge variant="outline">
              {DIFFICULTY_LABEL[question.difficulty ?? "medium"] ?? "Medium"}
            </Badge>
            <Badge variant="outline">
              {question.points} pt{question.points === 1 ? "" : "s"}
            </Badge>
          </div>

          <p className="text-base leading-relaxed font-medium wrap-anywhere">
            {question.text}
          </p>

          {isChoice ?
            <ul className="grid gap-2">
              {options.map((opt) => (
                <li
                  key={opt}
                  className="border-border bg-muted/40 flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm">
                  <span
                    className={`border-muted-foreground/40 size-4 shrink-0 rounded-${question.type === "multiple_choice" ? "sm" : "full"} border`}
                    aria-hidden
                  />
                  <span className="wrap-anywhere">{opt}</span>
                </li>
              ))}
            </ul>
          : question.type === "short_answer" ?
            <div className="border-input bg-background text-muted-foreground rounded-2xl border px-3 py-3 text-sm">
              Short answer field
            </div>
          : <div className="border-input bg-background text-muted-foreground min-h-28 rounded-2xl border px-3 py-3 text-sm">
              Long answer writing area
            </div>
          }

          {showStaffKey && question.answer ?
            <div className="border-border bg-muted/30 grid gap-1 rounded-2xl border p-3 text-sm">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Staff only — correct answer
              </p>
              <p className="wrap-anywhere whitespace-pre-wrap">{question.answer}</p>
            </div>
          : null}
        </div>

        <DialogFooter>
          {onEdit ?
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onEdit}>
              <PencilIcon className="size-4" /> Edit question
            </Button>
          : null}
          <Button
            type="button"
            size="lg"
            onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionPreviewDialog;
