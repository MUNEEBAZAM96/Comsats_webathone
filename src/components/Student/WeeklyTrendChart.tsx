"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  label: string;
  average: number | null;
  exams: number;
};

export const WeeklyTrendChart = ({ data }: { data: Point[] }) => {
  const chartData = data.map((d) => ({
    ...d,
    average: d.average ?? undefined,
  }));
  const hasAny = data.some((d) => d.average != null);

  if (!hasAny) {
    return (
      <p className="text-muted-foreground text-sm">
        Not enough data for a weekly trend yet.
      </p>
    );
  }

  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Weekly average score trend">
      <ResponsiveContainer
        width="100%"
        height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-border"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            width={36}
            unit="%"
          />
          <Tooltip
            formatter={(value) =>
              value == null ? ["—", "Average"] : [`${value}%`, "Average"]
            }
            labelFormatter={(label, payload) => {
              const exams = payload?.[0]?.payload?.exams;
              return exams != null ? `${label} · ${exams} exam(s)` : String(label);
            }}
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
