const difficulties = [
  { key: "easy", label: "Easy", color: "var(--chart-1)" },
  { key: "medium", label: "Medium", color: "var(--chart-4)" },
  { key: "hard", label: "Hard", color: "var(--chart-2)" },
  { key: "other", label: "Unspecified", color: "var(--chart-5)" },
];
const numberFormat = new Intl.NumberFormat("en");

const formatShare = (count: number, total: number) => {
  const share = (count / total) * 100;
  if (share > 0 && share < 1) return "<1%";
  if (share > 99 && share < 100) return ">99%";
  return `${Math.round(share)}%`;
};

const BankDifficultyPie = ({
  counts,
}: {
  counts: ReadonlyMap<string, number>;
}) => {
  const categories = difficulties
    .filter(({ key }) => key !== "other" || counts.has(key))
    .map((difficulty) => ({
      ...difficulty,
      count: counts.get(difficulty.key) ?? 0,
    }));
  const total = categories.reduce((sum, { count }) => sum + count, 0);
  if (!total) return null;

  const segments: string[] = [];
  let covered = 0;
  for (const { color, count } of categories) {
    if (!count) continue;
    const start = (covered / total) * 100;
    covered += count;
    segments.push(`${color} ${start}% ${(covered / total) * 100}%`);
  }

  return (
    <div className="@container">
      <div className="grid items-center gap-4 @min-[20rem]:grid-cols-[auto_minmax(0,1fr)]">
        <div
          aria-hidden="true"
          className="size-28 justify-self-center rounded-full border border-border shadow-sm"
          style={{ background: `conic-gradient(${segments.join(", ")})` }}
        />
        <div className="grid min-w-0 gap-2">
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {numberFormat.format(total)}
            </strong>{" "}
            {total === 1 ? "question" : "questions"} you created
          </p>
          <dl className="grid divide-y divide-border">
            {categories.map(({ key, label, color, count }) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5 first:pt-0 last:pb-0"
              >
                <dt className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="wrap-anywhere">{label}</span>
                </dt>
                <dd className="grid grid-cols-[auto_3.25rem] items-baseline gap-2 text-right tabular-nums">
                  <span className="text-sm font-semibold">
                    {numberFormat.format(count)}
                    <span className="sr-only">
                      {" "}
                      {count === 1 ? "question" : "questions"},{" "}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatShare(count, total)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

export { BankDifficultyPie };
