import { formatDurationMinutes } from "@/lib/date/format";

type AttemptPacing = {
  id: string;
  title: string;
  usedSeconds: number;
  availableSeconds: number;
};

const formatPacingDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const remaining = seconds % 60;
  return `${formatDurationMinutes(Math.floor(seconds / 60))}${remaining ? ` ${remaining}s` : ""}`;
};

const AttemptPacingPlot = ({ attempts }: { attempts: AttemptPacing[] }) => (
  <div className="@container grid gap-3">
    <p className="text-sm text-muted-foreground">
      Time left when each exam was submitted.
    </p>
    <ul className="grid gap-2">
      {attempts.map(({ id, title, usedSeconds, availableSeconds }) => {
        const timeLeft = availableSeconds - usedSeconds;
        const usedShare = usedSeconds / availableSeconds;
        const usedAngle = usedShare * 180;
        const percent = Math.round(usedShare * 100);
        const gaugeLabel =
          timeLeft > 0 && percent === 100
            ? ">99%"
            : usedSeconds > 0 && percent === 0
              ? "<1%"
              : `${percent}%`;

        return (
          <li
            key={id}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-muted/20 p-3 @min-[26rem]:gap-4 @min-[26rem]:px-4"
          >
            <div
              aria-hidden="true"
              className="relative aspect-[2/1] w-20 overflow-hidden @min-[26rem]:w-24"
            >
              <div
                className="aspect-square w-full rounded-full"
                style={{
                  background: `conic-gradient(from 270deg, var(--primary) ${usedAngle}deg, var(--border) ${usedAngle}deg 180deg, transparent 180deg)`,
                  maskImage: "radial-gradient(transparent 53%, black 54%)",
                }}
              />
              <span className="absolute inset-x-0 bottom-0 grid justify-items-center text-center tabular-nums">
                <strong className="font-heading text-base leading-none">
                  {gaugeLabel}
                </strong>
                <span className="text-[0.625rem] font-medium text-muted-foreground">
                  used
                </span>
              </span>
            </div>
            <div className="grid min-w-0 gap-2 @min-[30rem]:grid-cols-[minmax(0,1fr)_auto] @min-[30rem]:items-center @min-[30rem]:gap-x-4">
              <div className="grid min-w-0 gap-1">
                <p className="wrap-anywhere text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  <strong className="font-semibold text-foreground">
                    {formatPacingDuration(usedSeconds)}
                  </strong>{" "}
                  used of {formatPacingDuration(availableSeconds)}
                </p>
              </div>
              <dl className="flex flex-wrap items-baseline gap-x-1.5 @min-[30rem]:min-w-36 @min-[30rem]:flex-col @min-[30rem]:items-end @min-[30rem]:border-l @min-[30rem]:pl-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Time left
                </dt>
                <dd className="wrap-anywhere font-heading text-base leading-tight font-bold text-foreground tabular-nums @min-[30rem]:text-xl">
                  {formatPacingDuration(timeLeft)}
                </dd>
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

export { AttemptPacingPlot };
