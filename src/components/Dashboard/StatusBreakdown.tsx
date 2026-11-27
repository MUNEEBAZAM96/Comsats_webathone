type StatusCount = {
  label: string;
  count: number;
  tone?: "success" | "info" | "warning";
};

const colors = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
};

const StatusBreakdown = ({ items }: { items: StatusCount[] }) => (
  <dl className="grid divide-y divide-border">
    {items.map(({ label, count, tone }) => (
      <div
        key={label}
        className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
          {tone && (
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${colors[tone]}`}
            />
          )}
          {label}
        </dt>
        <dd className="font-semibold tabular-nums">{count}</dd>
      </div>
    ))}
  </dl>
);

export { StatusBreakdown };
