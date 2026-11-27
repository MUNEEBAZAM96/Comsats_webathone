import { Button } from "@/components/shadcnui/button";
import { AccessError } from "@/server/examAccess";
import { getExamMonitor } from "@/server/monitoringActions";
import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { ExamMonitor } from "./ExamMonitor";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Scheduled",
  ongoing: "Running",
  completed: "Ended",
};

export const MonitorPage = async ({
  examId,
  viewerId,
  backHref,
  links = [],
}: {
  examId: string;
  viewerId: string;
  backHref: string;
  links?: { href: string; label: string }[];
}) => {
  let data;
  try {
    data = await getExamMonitor(examId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    return (
      <section className="grid gap-4">
        <h1 className="text-2xl font-medium">Monitor unavailable</h1>
        <p className="text-muted-foreground">{e.message}</p>
        <Link
          href={backHref as Route}
          className="text-primary text-sm hover:underline">
          ← Back
        </Link>
      </section>
    );
  }

  const { exam } = data;
  const examWindow =
    exam.startTime && exam.endTime ?
      `${format(exam.startTime, "MMM d, h:mm a")} – ${format(exam.endTime, "MMM d, h:mm a")}`
    : null;

  return (
    <section className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={backHref as Route}>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Back">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-medium">{exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              {STATUS_LABEL[exam.effectiveStatus] ?? exam.effectiveStatus} ·{" "}
              {exam.duration} min · {exam.questionCount} questions
              {examWindow && ` · ${examWindow}`}
            </p>
          </div>
        </div>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href as Route}>
                <Button
                  variant="outline"
                  size="lg">
                  {l.label}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>
      <ExamMonitor
        initialData={data}
        viewerId={viewerId}
      />
    </section>
  );
};
