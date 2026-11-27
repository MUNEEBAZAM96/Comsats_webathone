import { cn } from "@/lib/utils";

const severities = [
  {
    key: "high",
    label: "High",
    color: "border-destructive/65 bg-destructive/25",
  },
  { key: "medium", label: "Medium", color: "border-warning/65 bg-warning/25" },
  { key: "low", label: "Low", color: "border-info/65 bg-info/25" },
  {
    key: "other",
    label: "Unspecified",
    color: "border-muted-foreground/65 bg-muted-foreground/25",
  },
];

const IncidentSeverityBubbles = ({
  counts,
}: {
  counts: ReadonlyMap<string, number>;
}) => {
  const max = Math.max(1, ...counts.values());

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Open or under-review incidents across exams assigned to you. Larger
        circles represent more reports.
      </p>
      <dl
        className={cn(
          "grid gap-2",
          counts.has("other") ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
        )}
      >
        {severities
          .filter(({ key }) => key !== "other" || counts.has(key))
          .map(({ key, label, color }) => {
            const count = counts.get(key) ?? 0;
            const diameter = 100 * Math.sqrt(count / max);

            return (
              <div
                className="grid min-w-0 justify-items-center gap-1 rounded-lg bg-muted/30 p-2 sm:p-3"
                key={key}
              >
                <dt className="grid w-full min-w-0 justify-items-center gap-1 wrap-anywhere text-center text-xs text-muted-foreground sm:text-sm">
                  <span
                    aria-hidden="true"
                    className="grid aspect-square w-full max-w-20 place-items-center"
                  >
                    <span
                      className={cn(
                        "block aspect-square rounded-full",
                        count > 0
                          ? `border ${color}`
                          : "size-3 border border-dashed border-muted-foreground",
                      )}
                      style={count > 0 ? { width: `${diameter}%` } : undefined}
                    />
                  </span>
                  {label}
                </dt>
                <dd className="font-heading text-lg font-semibold tabular-nums">
                  {count}
                </dd>
              </div>
            );
          })}
      </dl>
    </div>
  );
};

export { IncidentSeverityBubbles };
