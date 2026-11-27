"use client";

import type { LoadedExamAnalytics } from "@/features/analytics/services/examAnalytics";
import { formatScore } from "@/lib/exam/grading";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Submitted by candidate",
  timer: "Timer ran out",
  resume_finalize: "Closed on return",
  server_sweep: "Closed by server",
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="border-border rounded-lg border p-3">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className="text-2xl font-medium tabular-nums">{value}</p>
  </div>
);

const fmt = (n: number | null, suffix = "") => (n === null ? "—" : `${formatScore(n)}${suffix}`);

export const ExamAnalyticsCharts = ({ data }: { data: LoadedExamAnalytics }) => {
  if (data.empty) {
    return (
      <p className="text-muted-foreground text-sm">
        No submitted attempts yet — analytics will appear after candidates finish.
      </p>
    );
  }
  const { participation: p, scores: s } = data;

  return (
    <div
      className="grid gap-8"
      data-testid="exam-analytics">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Assigned" value={String(p.assigned)} />
        <Stat label="Submitted" value={String(p.submitted)} />
        <Stat label="Did not start" value={String(p.notStarted)} />
        <Stat label="Completion" value={p.completionRate === null ? "—" : `${p.completionRate}%`} />
        <Stat label="Awaiting marks" value={String(p.pendingGrading)} />
        <Stat label="Median time" value={fmt(data.time.medianMinutes, " min")} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={`Mean (of ${s.maxScore})`} value={fmt(s.mean)} />
        <Stat label="Median" value={fmt(s.median)} />
        <Stat label="Lowest" value={fmt(s.min)} />
        <Stat label="Highest" value={fmt(s.max)} />
        <Stat label="Std deviation" value={fmt(s.stdDev)} />
        <Stat
          label={s.passMarkPercent === null ? "Pass rate (no pass mark)" : `Pass rate (≥${s.passMarkPercent}%)`}
          value={s.passRate === null ? "—" : `${s.passRate}%`}
        />
      </div>

      <section className="border-border grid gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Score distribution (graded attempts)</h3>
        <div
          className="h-56"
          aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={s.histogram}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Candidates" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Number of candidates per score band</caption>
          <thead>
            <tr>
              <th scope="col">Band</th>
              <th scope="col">Candidates</th>
            </tr>
          </thead>
          <tbody>
            {s.histogram.map((h) => (
              <tr key={h.label}>
                <td>{h.label}</td>
                <td>{h.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border-border grid gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Questions</h3>
        <p className="text-muted-foreground text-xs">
          Difficulty is the average share of points earned (1 = everyone got full marks).
          Discrimination compares the top and bottom 27% of candidates (above 0.3 is good;
          negative values suggest a flawed question).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">#</th>
                <th scope="col" className="py-2 pr-3 font-medium">Question</th>
                <th scope="col" className="py-2 pr-3 font-medium">Difficulty</th>
                <th scope="col" className="py-2 pr-3 font-medium">Discrimination</th>
                <th scope="col" className="py-2 pr-3 font-medium">Blank</th>
                <th scope="col" className="py-2 pr-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.questions.map((q) => (
                <tr
                  key={q.id}
                  className="border-t align-top">
                  <td className="py-2 pr-3 tabular-nums">{q.number}</td>
                  <td className="max-w-xs py-2 pr-3">
                    <span className="line-clamp-2">{q.text}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmt(q.difficulty)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmt(q.discrimination)}</td>
                  <td className="py-2 pr-3 tabular-nums">{q.blankPct}%</td>
                  <td className="text-muted-foreground py-2 pr-3 text-xs">
                    {q.optionFrequency.length > 0 ?
                      q.optionFrequency.map((o) => `${o.option}: ${o.count} (${o.pct}%)`).join(" · ")
                    : q.averageManualScore !== null ?
                      `Average mark ${fmt(q.averageManualScore)}/${q.points}`
                    : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-border grid content-start gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-medium">How attempts ended</h3>
          <ul className="grid gap-1 text-sm">
            {Object.entries(data.time.bySubmitSource).map(([k, v]) => (
              <li
                key={k}
                className="flex justify-between gap-2">
                <span>{SOURCE_LABEL[k] ?? k}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="border-border grid content-start gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Incidents (context only — not evidence)</h3>
          {data.integrity.total === 0 ?
            <p className="text-muted-foreground text-sm">No incidents recorded.</p>
          : <ul className="grid gap-1 text-sm">
              {Object.entries(data.integrity.byCategory).map(([k, v]) => (
                <li
                  key={k}
                  className="flex justify-between gap-2">
                  <span className="capitalize">{k}</span>
                  <span className="tabular-nums">{v}</span>
                </li>
              ))}
              <li className="text-muted-foreground text-xs">
                By severity:{" "}
                {Object.entries(data.integrity.bySeverity)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(", ")}
              </li>
            </ul>
          }
        </section>
      </div>
    </div>
  );
};
