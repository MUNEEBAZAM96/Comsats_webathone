import { Button } from "@/components/shadcnui/button";
import { AccessError } from "@/server/examAccess";
import { getGradingQueue, getPublicationState } from "@/server/gradingActions";
import { ArrowLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { GradeHistory } from "./GradeHistory";
import { GradingWorkspace } from "./GradingWorkspace";
import { PublishResultsControls } from "./PublishResultsControls";

export const GradingPage = async ({
  examId,
  basePath,
}: {
  examId: string;
  basePath: "/admin" | "/examiner";
}) => {
  let queue;
  let publication;
  try {
    queue = await getGradingQueue(examId);
    publication = await getPublicationState(examId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    return (
      <section className="grid gap-4">
        <h1 className="text-2xl font-medium">Grading unavailable</h1>
        <p className="text-muted-foreground">{e.message}</p>
        <Link
          href={`${basePath}/exams` as Route}
          className="text-primary text-sm hover:underline">
          ← Back to exams
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`${basePath}/exams/${examId}/results` as Route}>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Back to results">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-medium">Grading · {queue.exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              {queue.summary.finishedAttempts} submitted attempt
              {queue.summary.finishedAttempts === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Link href={`${basePath}/exams/${examId}/results` as Route}>
          <Button
            variant="outline"
            size="lg">
            Results &amp; analytics
          </Button>
        </Link>
      </div>
      <PublishResultsControls
        examId={examId}
        state={publication}
      />
      <GradingWorkspace initial={queue} />
      <GradeHistory
        examId={examId}
        canRegrade={!queue.exam.resultsPublishedAt}
      />
    </section>
  );
};
