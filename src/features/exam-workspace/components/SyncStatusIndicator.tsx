"use client";

import { Button } from "@/components/shadcnui/button";
import { cn } from "@/lib/utils";
import type { SaveAnswersFailure } from "@/lib/exam/syncSchemas";
import {
  CheckIcon,
  CloudOffIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SyncSnapshot } from "../offline/sync-manager";

const CLOSED_LABEL: Record<SaveAnswersFailure, string> = {
  deadline_passed: "Time is up — answers can no longer be saved",
  already_submitted: "This attempt has been submitted",
  unauthorized: "Session ended — answers kept on this device",
  invalid: "Some answers could not be saved",
};

const plural = (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`;

export const SyncStatusIndicator = ({
  snapshot,
  onRetry,
}: {
  snapshot: SyncSnapshot;
  onRetry: () => void;
}) => {
  const [now, setNow] = useState<number | null>(null);
  const counting = snapshot.state === "retrying" && snapshot.nextRetryAt !== null;

  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  const seconds =
    counting && now !== null && snapshot.nextRetryAt !== null ?
      Math.max(0, Math.ceil((snapshot.nextRetryAt - now) / 1000))
    : null;
  const n = snapshot.pendingCount;

  let icon = <CheckIcon aria-hidden="true" className="text-success size-4" />;
  let label = "All answers saved";
  let tone = "text-muted-foreground";

  switch (snapshot.state) {
    case "restoring":
      icon = <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />;
      label = "Restoring saved answers…";
      break;
    case "pending":
    case "saving":
      icon = <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />;
      label = "Saving…";
      break;
    case "offline":
      icon = <CloudOffIcon aria-hidden="true" className="text-warning size-4" />;
      label = `Offline — answers kept on this device (${plural(n)} not sent)`;
      tone = "text-warning";
      break;
    case "retrying":
      icon = <RefreshCwIcon aria-hidden="true" className="text-warning size-4" />;
      label = `Some answers could not be saved — retrying${seconds !== null ? ` in ${seconds}s` : ""} (${plural(n)} pending)`;
      tone = "text-warning";
      break;
    case "error":
      icon = <TriangleAlertIcon aria-hidden="true" className="size-4" />;
      label = `Some answers could not be saved (${plural(n)} pending)`;
      tone = "text-destructive";
      break;
    case "closed":
      icon = <LockIcon aria-hidden="true" className="size-4" />;
      label =
        snapshot.closedReason ?
          CLOSED_LABEL[snapshot.closedReason]
        : CLOSED_LABEL.already_submitted;
      tone =
        snapshot.closedReason === "already_submitted" ?
          "text-muted-foreground"
        : "text-destructive";
      break;
  }

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", tone)}
      data-sync-state={snapshot.state}>
      <span
        role="status"
        className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {(snapshot.state === "error" || snapshot.state === "retrying") && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          Retry now
        </Button>
      )}
      {!snapshot.storageAvailable && snapshot.state !== "closed" && (
        <span className="text-xs">
          (This browser is not keeping an offline copy — stay online.)
        </span>
      )}
    </span>
  );
};
