"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcnui/alert-dialog";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Textarea } from "@/components/shadcnui/textarea";
import type { PublicationState } from "@/server/gradingActions";
import { publishResults, unpublishResults } from "@/server/gradingActions";
import { format } from "date-fns";
import {
  CheckCircle2Icon,
  EyeOffIcon,
  Loader2Icon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const REVEAL_LABEL: Record<string, string> = {
  none: "candidates see that results are final, but no score",
  score_only: "candidates see their total and per-question scores and feedback, without correct answers",
  score_and_answers: "candidates see their scores, feedback and the correct answers",
};

export const PublishResultsControls = ({
  examId,
  state,
}: {
  examId: string;
  state: PublicationState;
}) => {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setBusy(true);
    try {
      const res = await publishResults(examId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Results published to ${res.data.candidates} candidate${res.data.candidates === 1 ? "" : "s"}`,
      );
      setConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not publish results. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setReasonError("Give a reason (at least 5 characters)");
      return;
    }
    setBusy(true);
    try {
      const res = await unpublishResults({ examId, reason: trimmed });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Results withdrawn. Candidates no longer see scores.");
      setWithdrawOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast.error("Could not withdraw results. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state.publishedAt) {
    return (
      <div
        className="bg-success-surface text-success grid gap-3 rounded-lg border border-current/20 p-4 sm:flex sm:items-center sm:justify-between"
        data-testid="results-published">
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <strong className="font-medium">
              Published on {format(state.publishedAt, "MMM d, yyyy, h:mm a")}
            </strong>
            {state.publishedByName && ` by ${state.publishedByName}`}. Marks are
            locked; withdraw results to change them.
            {state.unpublishUntil &&
              state.canUnpublish &&
              ` You can withdraw until ${format(state.unpublishUntil, "MMM d, h:mm a")}.`}
          </span>
        </p>
        {state.canUnpublish && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => setWithdrawOpen(true)}>
            <EyeOffIcon aria-hidden="true" />
            Withdraw results
          </Button>
        )}
        <AlertDialog
          open={withdrawOpen}
          onOpenChange={(open) => {
            setWithdrawOpen(open);
            if (!open) setReasonError("");
          }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw published results?</AlertDialogTitle>
              <AlertDialogDescription>
                {state.finished} candidate{state.finished === 1 ? "" : "s"} will
                stop seeing their results until you publish again. The reason is
                kept in the grading history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-invalid={!!reasonError}>
              <FieldLabel htmlFor="withdraw-reason">Reason</FieldLabel>
              <Textarea
                id="withdraw-reason"
                value={reason}
                maxLength={500}
                rows={3}
                aria-invalid={!!reasonError}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError("");
                }}
                placeholder="e.g. Correcting the mark for question 4"
              />
              {reasonError && <FieldError>{reasonError}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={withdraw}
                disabled={busy}>
                {busy && (
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                )}
                Withdraw results
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-medium">Results are not published.</span>{" "}
          <span className="text-muted-foreground">
            Candidates see &ldquo;awaiting results&rdquo; until you publish.
          </span>
        </p>
        <Button
          size="lg"
          disabled={!state.canPublish || busy}
          onClick={() => setConfirmOpen(true)}>
          <SendIcon aria-hidden="true" />
          Publish results
        </Button>
      </div>
      {state.blockers.length > 0 && (
        <ul
          className="text-warning grid gap-1 text-sm"
          aria-label="Why results cannot be published yet">
          {state.blockers.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {b}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish results?</AlertDialogTitle>
            <AlertDialogDescription>
              {state.finished} candidate{state.finished === 1 ? "" : "s"} will
              see results now; {REVEAL_LABEL[state.resultReveal] ?? state.resultReveal}.
              Marks are locked while results are published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={publish}
              disabled={busy}>
              {busy && (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              Publish to {state.finished}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
