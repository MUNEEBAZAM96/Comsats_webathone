import type { CSSProperties } from "react";

type StatusCount = {
  label: string;
  count: number;
  tone?: "success" | "info" | "warning";
};

const StatusBreakdown = ({ items }: { items: StatusCount[] }) => {
  const total = items.reduce((sum, { count }) => sum + count, 0);

  return (
    <dl className="grid gap-4">
      {items.map(({ label, count, tone }) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{count}</dd>
          <dd
            aria-hidden="true"
            className="status-track col-span-2">
            <span
              style={
                {
                  width: `${total ? (count / total) * 100 : 0}%`,
                  "--track-color": tone ? `var(--${tone})` : undefined,
                } as CSSProperties
              }
            />
          </dd>
        </div>
      ))}
    </dl>
  );
};

export { StatusBreakdown };
