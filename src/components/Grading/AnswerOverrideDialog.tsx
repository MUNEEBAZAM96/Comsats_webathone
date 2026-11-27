"use client";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcnui/dialog";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { Textarea } from "@/components/shadcnui/textarea";
import { formatScore } from "@/lib/exam/grading";
import { SCORE_STEP } from "@/lib/zodSchema";
import { overrideAutoScore, saveManualGrade } from "@/server/gradingActions";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** Staff result detail: mark a written answer or override an automatic score. */
export const AnswerOverrideDialog = ({
  answerId,
  points,
  manual,
  score,
  autoScore,
  manualScore,
  feedback,
}: {
  answerId: string;
  points: number;
  manual: boolean;
  score: number | null;
  autoScore: number | null;
  manualScore: number | null;
  feedback: string | null;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(score ?? ""));
  const [text, setText] = useState(feedback ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (restore = false) => {
    setBusy(true);
    const res = await (manual ?
      saveManualGrade({ answerId, score: value, feedback: text })
    : overrideAutoScore({ answerId, score: restore ? null : value, reason })
    ).catch(() => null);
    setBusy(false);
    if (!res) return toast.error("Could not save. Check your connection.");
    if (!res.ok) return toast.error(res.error);
    toast.success(restore ? "Automatic score restored" : "Score saved");
    setOpen(false);
    setReason("");
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="justify-self-start"
          />
        }>
        <PencilIcon aria-hidden="true" />
        {manual ? (score == null ? "Mark answer" : "Change mark") : "Override score"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{manual ? "Mark answer" : "Override automatic score"}</DialogTitle>
          <DialogDescription>
            {manual ?
              `Award 0–${points} points in steps of ${SCORE_STEP}.`
            : `Automatic score: ${formatScore(autoScore)}/${points}. Overrides need a reason and are kept in the grading history.`}
          </DialogDescription>
        </DialogHeader>
        <fieldset
          disabled={busy}
          className="grid gap-4">
          <Field>
            <FieldLabel htmlFor={`score-${answerId}`}>Score</FieldLabel>
            <Input
              id={`score-${answerId}`}
              type="number"
              min={0}
              max={points}
              step={SCORE_STEP}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="max-w-40"
            />
          </Field>
          {manual ?
            <Field>
              <FieldLabel htmlFor={`feedback-${answerId}`}>Feedback (optional)</FieldLabel>
              <Textarea
                id={`feedback-${answerId}`}
                rows={4}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          : <Field>
              <FieldLabel htmlFor={`reason-${answerId}`}>Reason</FieldLabel>
              <Textarea
                id={`reason-${answerId}`}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          }
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              onClick={() => void save()}>
              {busy && (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              Save
            </Button>
            {!manual && manualScore != null && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => void save(true)}>
                Restore automatic score
              </Button>
            )}
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
};
