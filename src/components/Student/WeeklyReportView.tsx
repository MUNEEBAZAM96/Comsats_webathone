"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import { PctBadge } from "@/components/Results/PctBadge";

type WeeklyReport = Awaited<
  ReturnType<typeof import("@/server/studentAnalytics").getStudentWeeklyReport>
>;

export const WeeklyReportView = ({ report }: { report: WeeklyReport }) => {
  const router = useRouter();

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-medium">Weekly performance</h1>
          <p className="text-muted-foreground text-sm">{report.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() =>
              router.push(
                `/student/reports/weekly?week=${report.offsetWeeks + 1}` as Route,
              )
            }>
            <ArrowLeftIcon className="size-4" /> Previous week
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={report.offsetWeeks <= 0}
            onClick={() =>
              router.push(
                `/student/reports/weekly?week=${Math.max(0, report.offsetWeeks - 1)}` as Route,
              )
            }>
            Next week <ArrowRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      {!report.enoughData ?
        <div className="border-border bg-muted/20 rounded-3xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">Not enough data</p>
          <p className="text-muted-foreground mt-1 text-sm">
            No published results fall in this week. Try another week or complete
            an exam after results are released.
          </p>
          <Link
            href={"/student/results" as Route}
            className="text-primary mt-4 inline-block text-sm hover:underline">
            Back to results
          </Link>
        </div>
      : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-border rounded-3xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Exams</p>
              <p className="text-2xl font-medium">{report.examsCompleted}</p>
            </div>
            <div className="border-border rounded-3xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Average</p>
              <p className="text-2xl font-medium tabular-nums">
                {report.average == null ? "—" : `${report.average}%`}
              </p>
              <p className="text-muted-foreground text-xs">
                {report.delta == null ?
                  "No prior week to compare"
                : `${report.delta > 0 ? "+" : ""}${report.delta}% vs previous week`}
              </p>
            </div>
            <div className="border-border rounded-3xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">
                Objective accuracy
              </p>
              <p className="text-2xl font-medium tabular-nums">
                {report.objectiveAccuracy == null ?
                  "—"
                : `${report.objectiveAccuracy}%`}
              </p>
            </div>
            <div className="border-border rounded-3xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">
                Written average
              </p>
              <p className="text-2xl font-medium tabular-nums">
                {report.writtenAverage == null ?
                  "—"
                : `${report.writtenAverage}%`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border-border rounded-3xl border p-5">
              <h2 className="mb-3 font-medium">Activity</h2>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Questions attempted</dt>
                  <dd className="tabular-nums">{report.questionsAttempted}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Skipped</dt>
                  <dd className="tabular-nums">{report.questionsSkipped}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Time spent</dt>
                  <dd className="tabular-nums">{report.minutesSpent} min</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Strongest topic</dt>
                  <dd>
                    {report.strongestTopic ?
                      `${report.strongestTopic.name} (${report.strongestTopic.average}%)`
                    : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Weakest topic</dt>
                  <dd>
                    {report.weakestTopic ?
                      `${report.weakestTopic.name} (${report.weakestTopic.average}%)`
                    : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="border-border rounded-3xl border p-5">
              <h2 className="mb-3 font-medium">Recommended study areas</h2>
              {report.recommended.length === 0 ?
                <p className="text-muted-foreground text-sm">
                  No weak topics this week — keep practicing.
                </p>
              : <ul className="grid gap-2 text-sm">
                  {report.recommended.map((name) => (
                    <li
                      key={name}
                      className="rounded-2xl border px-3 py-2">
                      {name}
                    </li>
                  ))}
                </ul>
              }
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border-border rounded-3xl border p-5">
              <h2 className="mb-3 font-medium">Topic performance</h2>
              {report.topics.length === 0 ?
                <p className="text-muted-foreground text-sm">No topic data.</p>
              : <ul className="grid gap-2">
                  {report.topics.map((t) => (
                    <li
                      key={t.name}
                      className="flex items-center justify-between gap-3 text-sm">
                      <span className="wrap-anywhere">{t.name}</span>
                      <PctBadge pct={t.average} />
                    </li>
                  ))}
                </ul>
              }
            </div>
            <div className="border-border rounded-3xl border p-5">
              <h2 className="mb-3 font-medium">Question types</h2>
              {report.types.length === 0 ?
                <p className="text-muted-foreground text-sm">No type data.</p>
              : <ul className="grid gap-2">
                  {report.types.map((t) => (
                    <li
                      key={t.name}
                      className="flex items-center justify-between gap-3 text-sm">
                      <span>{t.name.replaceAll("_", " ")}</span>
                      <PctBadge pct={t.average} />
                    </li>
                  ))}
                </ul>
              }
            </div>
          </div>

          {(report.feedbackThemes.strengths.length > 0 ||
            report.feedbackThemes.improvements.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border-border rounded-3xl border p-5">
                <h2 className="mb-3 font-medium">Recent strengths</h2>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {report.feedbackThemes.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="border-border rounded-3xl border p-5">
                <h2 className="mb-3 font-medium">Areas to improve</h2>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {report.feedbackThemes.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="border-border rounded-3xl border p-5">
            <h2 className="mb-3 font-medium">Exams this week</h2>
            <ul className="grid gap-2">
              {report.exams.map((exam) => (
                <li key={exam.id}>
                  <Link
                    href={`/student/results/${exam.id}` as Route}
                    className="hover:bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm">
                    <div className="grid gap-0.5">
                      <span className="font-medium wrap-anywhere">
                        {exam.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {exam.submittedAt ?
                          format(exam.submittedAt, "MMM d, yyyy")
                        : "—"}
                      </span>
                    </div>
                    {exam.percent != null ?
                      <PctBadge pct={exam.percent} />
                    : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      }
    </section>
  );
};
