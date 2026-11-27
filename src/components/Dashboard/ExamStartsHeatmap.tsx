import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { formatDisplayDate } from "@/lib/date/format";
import { cn } from "@/lib/utils";

const weekOptions = { weekStartsOn: 1 } as const;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const activityColors = [
  "bg-muted/40",
  "bg-primary/15",
  "bg-primary/25",
  "bg-primary/40",
];

const ExamStartsHeatmap = ({
  firstDay,
  lastDay,
  countsByDay,
}: {
  firstDay: string;
  lastDay: string;
  countsByDay: ReadonlyMap<string, number>;
}) => {
  const first = parseISO(firstDay);
  const last = parseISO(lastDay);
  const start = startOfWeek(first, weekOptions);
  const end = endOfWeek(last, weekOptions);
  const weekStarts = eachDayOfInterval({ start, end }, { step: 7 });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Published exams by start date · {format(first, "MMM d")} to{" "}
        {formatDisplayDate(last)} (UTC)
      </p>
      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">
          Number of published exam starts per calendar date
        </caption>
        <thead>
          <tr>
            {weekdays.map((day) => (
              <th
                key={day}
                scope="col"
                className="py-1 text-[0.625rem] font-medium text-muted-foreground sm:text-xs"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weekStarts.map((week) => (
            <tr key={format(week, "yyyy-MM-dd")}>
              {weekdays.map((weekday, index) => {
                const date = addDays(week, index);
                const key = format(date, "yyyy-MM-dd");
                if (key < firstDay || key > lastDay)
                  return <td key={weekday} />;

                const count = countsByDay.get(key) ?? 0;
                const color =
                  activityColors[count > 3 ? 3 : count > 1 ? 2 : count];
                const label = `${formatDisplayDate(date)}, ${count} exam ${count === 1 ? "start" : "starts"}`;

                return (
                  <td
                    key={weekday}
                    title={label}
                    className={cn(
                      "rounded-md border p-0.5 tabular-nums sm:p-1",
                      color,
                    )}
                  >
                    <span className="sr-only">{label}</span>
                    <span
                      aria-hidden="true"
                      className="block text-[0.625rem] text-foreground sm:text-xs"
                    >
                      {format(date, "d")}
                    </span>
                    <span
                      aria-hidden="true"
                      className="block wrap-anywhere text-xs leading-tight font-semibold sm:text-sm"
                    >
                      {count}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {["0", "1", "2–3", "4+"].map((count, index) => (
          <span key={count} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-3 rounded-sm border", activityColors[index])}
            />
            {count}
          </span>
        ))}
        <span>exam starts</span>
      </div>
    </div>
  );
};

export { ExamStartsHeatmap };
