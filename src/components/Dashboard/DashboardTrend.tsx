"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  label: string;
  detail: string;
  value: number;
};

type TrendProps = {
  points: TrendPoint[];
  metric: string;
  variant: "daily-count" | "percentage";
};

const DashboardTrend = ({ points, metric, variant }: TrendProps) => {
  const percentage = variant === "percentage";
  const Chart = percentage ? LineChart : BarChart;
  const formatValue = (value: number) =>
    percentage ? `${value}%` : value.toLocaleString("en");

  return (
    <div className="grid min-w-0 gap-3">
      <div aria-hidden="true" className="h-48 min-w-0 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <Chart
            accessibilityLayer={false}
            data={points}
            margin={{ top: 9, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              tickMargin={8}
              minTickGap={20}
              interval={
                percentage ? "preserveStartEnd" : "equidistantPreserveEnd"
              }
            />
            <YAxis
              domain={percentage ? [0, 100] : [0, "auto"]}
              ticks={percentage ? [0, 25, 50, 75, 100] : undefined}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={formatValue}
              width={46}
            />
            <Tooltip
              cursor={
                percentage
                  ? {
                      stroke: "var(--muted-foreground)",
                      strokeDasharray: "3 4",
                    }
                  : { fill: "var(--muted)", fillOpacity: 0.55, stroke: "none" }
              }
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as TrendPoint | undefined;
                if (!active || !point) return null;

                return (
                  <div className="max-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md sm:max-w-60">
                    <p className="wrap-anywhere font-semibold">
                      {point.detail}
                    </p>
                    <p className="mt-1 tabular-nums text-muted-foreground">
                      {metric}{" "}
                      <span className="font-semibold text-popover-foreground">
                        {formatValue(point.value)}
                      </span>
                    </p>
                  </div>
                );
              }}
            />
            {percentage ? (
              <Line
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={{
                  r: 4,
                  fill: "var(--chart-1)",
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: "var(--chart-1)",
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            ) : (
              <Bar
                dataKey="value"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                isAnimationActive={false}
              />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="w-fit cursor-pointer rounded-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2">
          View chart data
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="py-1.5 font-medium">
                {percentage ? "Exam" : "Date (UTC)"}
              </th>
              <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                {metric}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map(({ detail, value }, index) => (
              <tr key={index}>
                <th scope="row" className="wrap-anywhere py-1.5 font-normal">
                  {detail}
                </th>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {formatValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

export { DashboardTrend };
