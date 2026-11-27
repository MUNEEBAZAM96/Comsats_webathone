"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Analytics = {
  examTitle: string;
  attemptCount: number;
  average: number;
  highest: number;
  lowest: number;
  pass: number;
  fail: number;
  questionStats: {
    id: string;
    text: string;
    difficulty: string;
    correctRate: number;
  }[];
  trend: { index: number; score: number; label: string }[];
  empty: boolean;
};

const COLORS = ["#16a34a", "#dc2626"];

export const ExamAnalyticsCharts = ({ data }: { data: Analytics }) => {
  if (data.empty) {
    return (
      <p className="text-muted-foreground text-sm">
        No submitted attempts yet — analytics will appear after candidates
        finish.
      </p>
    );
  }

  const passFail = [
    { name: "Pass", value: data.pass },
    { name: "Fail", value: data.fail },
  ];

  return (
    <div className="grid gap-8">
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat
          label="Attempts"
          value={String(data.attemptCount)}
        />
        <Stat
          label="Average"
          value={String(data.average)}
        />
        <Stat
          label="Highest"
          value={String(data.highest)}
        />
        <Stat
          label="Lowest"
          value={String(data.lowest)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-border grid gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Pass / fail</h3>
          <div className="h-56">
            <ResponsiveContainer
              width="100%"
              height="100%">
              <PieChart>
                <Pie
                  data={passFail}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label>
                  {passFail.map((_, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="border-border grid gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Score trend</h3>
          <div className="h-56">
            <ResponsiveContainer
              width="100%"
              height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="score"
                  fill="#2563eb"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="border-border grid gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Question correctness (%)</h3>
        <div className="h-72">
          <ResponsiveContainer
            width="100%"
            height="100%">
            <BarChart data={data.questionStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="difficulty"
                hide={false}
              />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Correct"]}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.text ?? "")
                }
              />
              <Bar
                dataKey="correctRate"
                fill="#0f766e"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="border-border rounded-lg border p-3">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className="text-2xl font-medium tabular-nums">{value}</p>
  </div>
);
