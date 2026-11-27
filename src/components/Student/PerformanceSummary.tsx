import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import { PctBadge } from "@/components/Results/PctBadge";
import { formatScore } from "@/lib/exam/grading";
import { WeeklyTrendChart } from "@/components/Student/WeeklyTrendChart";

type Dashboard = Awaited<
  ReturnType<typeof import("@/server/studentAnalytics").getStudentPerformanceDashboard>
>;

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="border-border bg-card grid gap-1 rounded-3xl border p-4">
    <p className="text-muted-foreground text-xs tracking-wide uppercase">
      {label}
    </p>
    <p className="text-2xl font-medium tabular-nums">{value}</p>
    {hint ?
      <p className="text-muted-foreground text-xs">{hint}</p>
    : null}
  </div>
);

export const PerformanceSummary = ({ data }: { data: Dashboard }) => (
  <div className="grid gap-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Exams completed"
        value={String(data.examsCompleted)}
      />
      <Stat
        label="Average score"
        value={data.average == null ? "—" : `${data.average}%`}
        hint={data.best == null ? undefined : `Best ${data.best}%`}
      />
      <Stat
        label="Objective accuracy"
        value={
          data.objectiveAccuracy == null ? "—" : `${data.objectiveAccuracy}%`
        }
      />
      <Stat
        label="Written average"
        value={data.writtenAverage == null ? "—" : `${data.writtenAverage}%`}
        hint={
          data.pendingResults > 0 ?
            `${data.pendingResults} awaiting release`
          : undefined
        }
      />
    </div>

    <section className="border-border bg-card grid gap-3 rounded-3xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Weekly score trend</h2>
        <Link href={"/student/reports/weekly" as Route}>
          <Button
            variant="outline"
            size="lg">
            Full weekly report
          </Button>
        </Link>
      </div>
      <WeeklyTrendChart data={data.weeklyTrend} />
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="border-border bg-card grid gap-3 rounded-3xl border p-5">
        <h2 className="font-medium">Strongest topics</h2>
        {data.strongestTopics.length === 0 ?
          <p className="text-muted-foreground text-sm">Not enough data yet.</p>
        : <ul className="grid gap-2">
            {data.strongestTopics.map((t) => (
              <li
                key={t.name}
                className="flex items-center justify-between gap-3 text-sm">
                <span className="wrap-anywhere">{t.name}</span>
                <PctBadge pct={t.average} />
              </li>
            ))}
          </ul>
        }
      </section>
      <section className="border-border bg-card grid gap-3 rounded-3xl border p-5">
        <h2 className="font-medium">Needs improvement</h2>
        {data.weakestTopics.length === 0 ?
          <p className="text-muted-foreground text-sm">Not enough data yet.</p>
        : <ul className="grid gap-2">
            {data.weakestTopics.map((t) => (
              <li
                key={t.name}
                className="flex items-center justify-between gap-3 text-sm">
                <span className="wrap-anywhere">{t.name}</span>
                <PctBadge pct={t.average} />
              </li>
            ))}
          </ul>
        }
      </section>
    </div>

    <section className="border-border bg-card grid gap-3 rounded-3xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Recent results</h2>
        <Link href={"/student/reports/weekly" as Route}>
          <Button
            variant="outline"
            size="lg">
            Weekly report <ArrowRightIcon className="size-4" />
          </Button>
        </Link>
      </div>
      {data.recent.length === 0 ?
        <p className="text-muted-foreground text-sm">
          Published results will appear here.
        </p>
      : <ul className="grid gap-2">
          {data.recent.map((r) => (
            <li key={r.id}>
              <Link
                href={`/student/results/${r.id}` as Route}
                className="hover:bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm">
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-medium wrap-anywhere">{r.examTitle}</span>
                  <span className="text-muted-foreground text-xs">
                    {r.submittedAt ?
                      format(r.submittedAt, "MMM d, yyyy")
                    : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {formatScore(r.totalScore)}/{r.maxScore}
                  </span>
                  {r.percent != null ?
                    <PctBadge pct={r.percent} />
                  : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      }
    </section>
  </div>
);
