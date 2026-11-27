"use client";

import { Button } from "@/components/shadcnui/button";
import { Card } from "@/components/shadcnui/card";
import { Input } from "@/components/shadcnui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/shadcnui/select";
import { cn } from "@/lib/utils";
import {
  listAnnouncements,
  listIncidents,
  refreshExamMonitor,
  type AnnouncementListItem,
  type ExamMonitorData,
  type ExamMonitorRow,
  type IncidentListItem,
} from "@/server/monitoringActions";
import { differenceInSeconds, format } from "date-fns";
import {
  InfoIcon,
  Loader2Icon,
  NotebookPenIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnnouncementPanel } from "./AnnouncementPanel";
import { AttemptTimelineSheet } from "./AttemptTimelineSheet";
import { IncidentDialog } from "./IncidentDialog";
import { IncidentList } from "./IncidentList";
import {
  EVENT_LABEL,
  MONITORING_DISCLAIMER,
  SIGNAL_SHORT,
  SIGNAL_TYPES,
  SUBMIT_SOURCE_LABEL,
} from "./labels";

const POLL_MS = 5_000;
const BACKOFF_POLL_MS = 15_000;
const BACKOFF_AFTER_ERRORS = 3;

type Filter =
  | "all"
  | "in_progress"
  | "not_started"
  | "finished"
  | "offline"
  | "attention";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Writing" },
  { id: "not_started", label: "Not started" },
  { id: "finished", label: "Finished" },
  { id: "offline", label: "Offline now" },
  { id: "attention", label: "Needs attention" },
];

type Sort = "name" | "progress" | "last_seen";

const SORT_LABEL: Record<Sort, string> = {
  name: "Name",
  progress: "Progress (lowest first)",
  last_seen: "Last seen (oldest first)",
};

const STATUS_LABEL: Record<ExamMonitorRow["status"], string> = {
  not_started: "Not started",
  in_progress: "Writing",
  time_up: "Time up",
  submitted: "Marking pending",
  graded: "Graded",
};

const STATUS_STYLE: Record<ExamMonitorRow["status"], string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-warning-surface text-warning",
  time_up: "bg-error-surface text-destructive",
  submitted: "bg-info-surface text-info",
  graded: "bg-success-surface text-success",
};

const CONNECTION_LABEL: Record<ExamMonitorRow["connection"], string> = {
  online: "Online",
  idle: "Idle",
  offline: "Offline",
  unknown: "—",
};

const CONNECTION_DOT: Record<ExamMonitorRow["connection"], string> = {
  online: "bg-success",
  idle: "bg-warning",
  offline: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

const noopSubscribe = () => () => {};

/** Clock times depend on the browser's timezone, so they render after hydration. */
const useIsClient = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const signalTotal = (events: Record<string, number>) =>
  SIGNAL_TYPES.reduce((sum, t) => sum + (events[t] ?? 0), 0);

const needsAttention = (row: ExamMonitorRow) =>
  row.connection === "offline" ||
  row.connection === "idle" ||
  row.status === "time_up" ||
  row.pendingLocal > 0 ||
  row.openIncidents > 0;

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ?
      `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const compareRows = (sort: Sort) => (a: ExamMonitorRow, b: ExamMonitorRow) => {
  if (sort === "progress") {
    const pa = a.questionCount > 0 ? a.answered / a.questionCount : 0;
    const pb = b.questionCount > 0 ? b.answered / b.questionCount : 0;
    if (pa !== pb) return pa - pb;
  }
  if (sort === "last_seen") {
    const la = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : -1;
    const lb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : -1;
    if (la !== lb) return la - lb;
  }
  return a.candidate.name.localeCompare(b.candidate.name);
};

const ConnectionCell = ({
  row,
  serverNow,
}: {
  row: ExamMonitorRow;
  serverNow: Date;
}) => {
  if (row.connection === "unknown")
    return <span className="text-muted-foreground text-xs">—</span>;
  const seen =
    row.lastSeenAt ?
      `${Math.max(0, differenceInSeconds(serverNow, new Date(row.lastSeenAt)))}s ago`
    : "never";
  return (
    <span className="grid gap-0.5 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", CONNECTION_DOT[row.connection])}
        />
        {CONNECTION_LABEL[row.connection]}
      </span>
      <span className="text-muted-foreground">Seen {seen}</span>
    </span>
  );
};

const SignalChips = ({ events }: { events: Record<string, number> }) => {
  const present = SIGNAL_TYPES.filter((t) => (events[t] ?? 0) > 0);
  if (present.length === 0)
    return <span className="text-muted-foreground text-xs">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {present.map((t) => (
        <span
          key={t}
          title={EVENT_LABEL[t]}
          className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] tabular-nums">
          {SIGNAL_SHORT[t]} ×{events[t]}
          <span className="sr-only"> ({EVENT_LABEL[t]})</span>
        </span>
      ))}
    </span>
  );
};

export const ExamMonitor = ({
  initialData,
  viewerId,
}: {
  initialData: ExamMonitorData;
  viewerId: string;
}) => {
  const examId = initialData.exam.id;
  const [data, setData] = useState(initialData);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pollError, setPollError] = useState("");
  const [errorStreak, setErrorStreak] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [query, setQuery] = useState("");
  const [incidents, setIncidents] = useState<IncidentListItem[] | null>(null);
  const [announcements, setAnnouncements] = useState<{
    announcements: AnnouncementListItem[];
    assigned: number;
  } | null>(null);
  const inFlight = useRef(false);
  const isClient = useIsClient();

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const res = await refreshExamMonitor(examId);
      if (res.ok) {
        setData(res.data);
        setFetchedAt(performance.now());
        setPollError("");
        setErrorStreak(0);
      } else {
        setPollError(res.error);
        setErrorStreak((n) => n + 1);
      }
    } catch {
      setPollError("Connection problem — showing the last known state.");
      setErrorStreak((n) => n + 1);
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [examId]);

  const loadIncidents = useCallback(async () => {
    const res = await listIncidents(examId).catch(() => null);
    if (res?.ok) setIncidents(res.data);
  }, [examId]);

  const loadAnnouncements = useCallback(async () => {
    const res = await listAnnouncements(examId).catch(() => null);
    if (res?.ok) setAnnouncements(res.data);
  }, [examId]);

  const refreshAll = useCallback(() => {
    void refresh();
    void loadIncidents();
    void loadAnnouncements();
  }, [loadAnnouncements, loadIncidents, refresh]);

  const finishedExam =
    data.exam.effectiveStatus === "completed" && data.summary.inProgress === 0;
  const pollMs = errorStreak >= BACKOFF_AFTER_ERRORS ? BACKOFF_POLL_MS : POLL_MS;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listIncidents(examId), listAnnouncements(examId)])
      .then(([incidentRes, announcementRes]) => {
        if (cancelled) return;
        if (incidentRes.ok) setIncidents(incidentRes.data);
        if (announcementRes.ok) setAnnouncements(announcementRes.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!live || finishedExam) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [finishedExam, live, pollMs, refresh]);

  // Local 1s tick so countdowns move between polls; re-seeded by each poll.
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed =
    fetchedAt !== null && now !== null ? Math.max(0, now - fetchedAt) : 0;
  const serverNow = new Date(new Date(data.serverNow).getTime() + elapsed);

  const q = query.trim().toLowerCase();
  const rows = data.rows
    .filter((row) => {
      if (
        q &&
        !row.candidate.name.toLowerCase().includes(q) &&
        !row.candidate.email.toLowerCase().includes(q)
      )
        return false;
      switch (filter) {
        case "in_progress":
          return row.status === "in_progress" || row.status === "time_up";
        case "not_started":
          return row.status === "not_started";
        case "finished":
          return row.status === "submitted" || row.status === "graded";
        case "offline":
          return row.connection === "offline";
        case "attention":
          return needsAttention(row);
        default:
          return true;
      }
    })
    .sort(compareRows(sort));

  const canSend =
    data.exam.effectiveStatus === "published" ||
    data.exam.effectiveStatus === "ongoing";
  const stats = [
    { label: "Assigned", value: data.summary.assigned },
    { label: "Not started", value: data.summary.notStarted },
    { label: "Writing", value: data.summary.inProgress },
    { label: "Marking pending", value: data.summary.submitted },
    { label: "Graded", value: data.summary.graded },
    { label: "Offline now", value: data.summary.offlineNow, alert: true },
    { label: "Open incidents", value: data.summary.openIncidents, alert: true },
  ];

  return (
    <div className="grid gap-8">
      <p className="bg-info-surface text-info flex items-start gap-2 rounded-md px-4 py-3 text-sm">
        <InfoIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
        />
        {MONITORING_DISCLAIMER}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="gap-1 p-4">
            <p className="text-muted-foreground text-xs tracking-wider uppercase">
              {s.label}
            </p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                s.alert && s.value > 0 && "text-destructive",
              )}>
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      <section
        aria-labelledby="monitor-candidates"
        className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="monitor-candidates"
            className="text-lg font-medium">
            Candidates
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              role="status"
              data-monitor-updated={new Date(data.serverNow).toISOString()}
              className={cn(
                "text-muted-foreground",
                pollError && "text-destructive",
              )}>
              {pollError ?
                `${pollError}${errorStreak >= BACKOFF_AFTER_ERRORS ? " Retrying every 15s." : ""}`
              : `Updated ${isClient ? format(new Date(data.serverNow), "HH:mm:ss") : "just now"}${
                  finishedExam ? " · exam finished"
                  : live ? ` · refreshing every ${pollMs / 1000}s`
                  : " · paused"
                }`
              }
            </span>
            {!finishedExam && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLive((v) => !v)}
                aria-pressed={!live}>
                {live ?
                  <PauseIcon aria-hidden="true" />
                : <PlayIcon aria-hidden="true" />}
                {live ? "Pause" : "Resume"}
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={refreshAll}
              disabled={refreshing}>
              {refreshing ?
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
              : <RefreshCwIcon aria-hidden="true" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter candidates"
            className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                variant={filter === f.id ? "default" : "outline"}
                size="lg"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger
                aria-label="Sort candidates"
                className="w-full sm:w-56">
                <span>Sort: {SORT_LABEL[sort]}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <SelectItem
                    key={s}
                    value={s}>
                    {SORT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search candidates</span>
              <SearchIcon
                aria-hidden="true"
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email"
                className="pl-9"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[60rem] text-sm">
            <caption className="sr-only">
              Candidates for this exam with progress, time left, connection and
              automated signals
            </caption>
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Candidate
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Status
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Progress
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Time left
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Connection
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  Signals
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted-foreground px-3 py-8 text-center">
                    No candidates match this view.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const remaining =
                  row.remainingMs !== null ?
                    Math.max(0, row.remainingMs - elapsed)
                  : null;
                const status =
                  row.status === "in_progress" && remaining === 0 ?
                    "time_up"
                  : row.status;
                const signals = signalTotal(row.events);
                return (
                  <tr
                    key={row.candidate.id}
                    data-candidate={row.candidate.email}
                    data-status={status}
                    data-connection={row.connection}
                    className={cn(
                      "border-t align-top",
                      needsAttention(row) && "bg-warning-surface/40",
                    )}>
                    <td className="px-3 py-3">
                      <div className="grid gap-0.5">
                        <span className="font-medium">{row.candidate.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {row.candidate.email}
                          {!row.assigned && " · no longer assigned"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLE[status],
                        )}>
                        {STATUS_LABEL[status]}
                      </span>
                      {row.submitSource && row.submitSource !== "manual" && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {SUBMIT_SOURCE_LABEL[row.submitSource] ?? row.submitSource}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid w-32 gap-1">
                        <span className="text-xs tabular-nums">
                          {row.answered}/{row.questionCount} answered
                        </span>
                        <progress
                          max={Math.max(1, row.questionCount)}
                          value={row.answered}
                          aria-label={`${row.candidate.name}: ${row.answered} of ${row.questionCount} answered`}
                          className="exam-progress h-1.5 w-full overflow-hidden rounded-full"
                        />
                        {row.pendingLocal > 0 && (
                          <span className="text-warning text-xs">
                            {row.pendingLocal} unsent on device
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular-nums">
                      {remaining !== null ?
                        formatRemaining(remaining)
                      : row.submittedAt ?
                        isClient ?
                          `Done ${format(new Date(row.submittedAt), "HH:mm")}`
                        : "Done"
                      : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <ConnectionCell
                        row={row}
                        serverNow={serverNow}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {row.attemptId && signals > 0 ?
                        <AttemptTimelineSheet
                          attemptId={row.attemptId}
                          candidateName={row.candidate.name}>
                          <SignalChips events={row.events} />
                        </AttemptTimelineSheet>
                      : <SignalChips events={row.events} />}
                      {row.openIncidents > 0 && (
                        <p className="text-destructive mt-1 text-xs">
                          {row.openIncidents} open incident
                          {row.openIncidents === 1 ? "" : "s"}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        {row.attemptId && (
                          <AttemptTimelineSheet
                            attemptId={row.attemptId}
                            candidateName={row.candidate.name}
                          />
                        )}
                        <IncidentDialog
                          examId={examId}
                          candidate={{ id: row.candidate.id, name: row.candidate.name }}
                          attemptId={row.attemptId}
                          onCreated={refreshAll}
                          trigger={
                            <Button
                              variant="outline"
                              size="lg"
                              aria-label={`Record incident for ${row.candidate.name}`}>
                              <NotebookPenIcon aria-hidden="true" />
                              <span className="hidden xl:inline">Incident</span>
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section
          aria-labelledby="monitor-incidents"
          className="grid content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="monitor-incidents"
              className="text-lg font-medium">
              Incidents
            </h2>
            <IncidentDialog
              examId={examId}
              onCreated={refreshAll}
            />
          </div>
          {incidents === null ?
            <p className="text-muted-foreground text-sm">Loading…</p>
          : <IncidentList
              incidents={incidents}
              canManage={data.canManage}
              onChanged={refreshAll}
            />
          }
        </section>

        <section
          aria-labelledby="monitor-announcements"
          className="grid content-start gap-4">
          <h2
            id="monitor-announcements"
            className="text-lg font-medium">
            Announcements
          </h2>
          {announcements === null ?
            <p className="text-muted-foreground text-sm">Loading…</p>
          : <AnnouncementPanel
              examId={examId}
              announcements={announcements.announcements}
              assigned={announcements.assigned}
              canSend={canSend}
              canManage={data.canManage}
              viewerId={viewerId}
              onChanged={() => void loadAnnouncements()}
            />
          }
        </section>
      </div>
    </div>
  );
};
