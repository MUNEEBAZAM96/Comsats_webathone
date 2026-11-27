"use client";

import { Button } from "@/components/shadcnui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/shadcnui/sheet";
import { cn } from "@/lib/utils";
import {
  getAttemptTimeline,
  type AttemptTimeline,
} from "@/server/monitoringActions";
import { format } from "date-fns";
import { HistoryIcon, InfoIcon, Loader2Icon, NotebookPenIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CATEGORY_LABEL,
  EVENT_LABEL,
  MONITORING_DISCLAIMER,
  SEVERITY_LABEL,
  SUBMIT_SOURCE_LABEL,
} from "./labels";

type Entry =
  | { kind: "event"; at: Date; id: string; type: string; detail: Record<string, string | number | boolean> | null }
  | { kind: "incident"; at: Date; id: string; text: string; meta: string }
  | { kind: "milestone"; at: Date; id: string; text: string };

const buildEntries = (data: AttemptTimeline): Entry[] => {
  const entries: Entry[] = [
    { kind: "milestone", at: new Date(data.attempt.startedAt), id: "start", text: "Started the exam" },
    ...data.events.map(
      (e): Entry => ({ kind: "event", at: new Date(e.createdAt), id: e.id, type: e.type, detail: e.detail }),
    ),
    ...data.incidents.map(
      (i): Entry => ({
        kind: "incident",
        at: new Date(i.createdAt),
        id: i.id,
        text: i.description,
        meta: `${CATEGORY_LABEL[i.category] ?? i.category} · ${SEVERITY_LABEL[i.severity] ?? i.severity} · recorded by ${i.reportedBy.name}`,
      }),
    ),
  ];
  if (data.attempt.submittedAt)
    entries.push({
      kind: "milestone",
      at: new Date(data.attempt.submittedAt),
      id: "submit",
      text:
        SUBMIT_SOURCE_LABEL[data.attempt.submitSource ?? "manual"] ?? "Submitted",
    });
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
};

const describeDetail = (detail: Record<string, string | number | boolean> | null) => {
  if (!detail) return null;
  const parts = Object.entries(detail).map(([k, v]) => `${k}: ${String(v)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
};

export const AttemptTimelineSheet = ({
  attemptId,
  candidateName,
  children,
}: {
  attemptId: string;
  candidateName: string;
  /** Custom trigger content (e.g. indicator chips); defaults to a button. */
  children?: ReactNode;
}) => {
  const [data, setData] = useState<AttemptTimeline | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAttemptTimeline(attemptId);
      if (res.ok) setData(res.data);
      else setError(res.error);
    } catch {
      setError("Could not load the timeline.");
    } finally {
      setLoading(false);
    }
  };

  const entries = data ? buildEntries(data) : [];

  return (
    <Sheet onOpenChange={(open) => open && void load()}>
      {children ?
        <SheetTrigger
          aria-label={`Signals for ${candidateName} — open timeline`}
          className="focus-visible:ring-ring rounded-md text-left hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none">
          {children}
        </SheetTrigger>
      : <SheetTrigger
          render={
            <Button
              variant="outline"
              size="lg"
              aria-label={`Timeline for ${candidateName}`}
            />
          }>
          <HistoryIcon aria-hidden="true" />
          <span className="hidden xl:inline">Timeline</span>
        </SheetTrigger>
      }
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{candidateName}</SheetTitle>
          <SheetDescription>
            Server-recorded activity for this attempt. Answer content is never
            shown here.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-6 pb-6">
          <p className="bg-info-surface text-info flex gap-2 rounded-md px-3 py-2 text-xs">
            <InfoIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {MONITORING_DISCLAIMER}
          </p>
          {loading && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2Icon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Loading…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="text-destructive text-sm">
              {error}
            </p>
          )}
          {data && (
            <>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded-md p-2">
                  <dt className="text-muted-foreground">Last heartbeat</dt>
                  <dd className="font-medium">
                    {data.attempt.lastSeenAt ?
                      format(new Date(data.attempt.lastSeenAt), "h:mm:ss a")
                    : "—"}
                  </dd>
                </div>
                <div className="bg-muted rounded-md p-2">
                  <dt className="text-muted-foreground">Last answer saved</dt>
                  <dd className="font-medium">
                    {data.attempt.lastSyncAt ?
                      format(new Date(data.attempt.lastSyncAt), "h:mm:ss a")
                    : "—"}
                  </dd>
                </div>
              </dl>
              <ol className="relative grid gap-3 border-l pl-4">
                {entries.map((entry) => (
                  <li
                    key={`${entry.kind}-${entry.id}`}
                    className="relative grid gap-0.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full border-2 border-background",
                        entry.kind === "incident" ? "bg-destructive"
                        : entry.kind === "milestone" ? "bg-primary"
                        : "bg-muted-foreground",
                      )}
                    />
                    <time
                      dateTime={entry.at.toISOString()}
                      className="text-muted-foreground text-xs tabular-nums">
                      {format(entry.at, "h:mm:ss a")}
                    </time>
                    {entry.kind === "event" && (
                      <>
                        <span>{EVENT_LABEL[entry.type] ?? entry.type}</span>
                        {describeDetail(entry.detail) && (
                          <span className="text-muted-foreground text-xs">
                            {describeDetail(entry.detail)}
                          </span>
                        )}
                      </>
                    )}
                    {entry.kind === "milestone" && (
                      <span className="font-medium">{entry.text}</span>
                    )}
                    {entry.kind === "incident" && (
                      <span className="grid gap-0.5">
                        <span className="text-destructive flex items-center gap-1 font-medium">
                          <NotebookPenIcon
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          Incident
                        </span>
                        <span className="break-words whitespace-pre-wrap">{entry.text}</span>
                        <span className="text-muted-foreground text-xs">{entry.meta}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {data.events.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No automatic signals were recorded.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
