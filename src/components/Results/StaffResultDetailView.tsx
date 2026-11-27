import { Button } from "@/components/shadcnui/button";
import { AnswerOverrideDialog } from "@/components/Grading/AnswerOverrideDialog";
import { SUBMIT_SOURCE_LABEL } from "@/components/Monitoring/labels";
import { StatusBadge } from "@/components/Results/StatusBadge";
import { ResultReview } from "@/components/Student/ResultReview";
import { PublishResultReportButton } from "@/features/reports/components/PublishResultReportButton";
import { formatScore } from "@/lib/exam/grading";
import { getResultDetail } from "@/server/resultsActions";
import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

const ACTION_LABEL: Record<string, string> = {
  grade: "Marked",
  override: "Override",
  regrade: "Re-graded",
};

export const StaffResultDetailView = async ({
  attemptId,
  basePath,
}: {
  attemptId: string;
  basePath: "/admin" | "/examiner" | "/proctor";
}) => {
  const data = await getResultDetail(attemptId);
  const published = Boolean(data.exam.resultsPublishedAt);
  const canEdit = data.canManage && !published;
  const answerByQuestion = new Map(data.answers.map((a) => [a.questionId, a]));

  const answerActions =
    canEdit ?
      Object.fromEntries(
        data.questions.flatMap((q) => {
          const a = answerByQuestion.get(q.id);
          if (!a) return [];
          return [
            [
              q.id,
              <AnswerOverrideDialog
                key={a.id}
                answerId={a.id}
                points={q.points}
                manual={q.manual}
                score={a.score}
                autoScore={a.autoScore}
                manualScore={a.manualScore}
                feedback={a.feedback}
              />,
            ],
          ];
        }),
      )
    : undefined;

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="flex items-center gap-4">
        <Link href={`${basePath}/results` as Route}>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Back to results">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div className="grid gap-1">
          <h1 className="text-2xl font-medium">{data.exam.title}</h1>
          <p className="text-muted-foreground text-sm">
            {data.user.name} ({data.user.email})
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={data.status} />
        <span className="text-muted-foreground">
          Auto {formatScore(data.autoScore)} · Manual {formatScore(data.manualScore)} · Total{" "}
          {data.totalScore === null ? "pending" : `${formatScore(data.totalScore)}/${data.maxScore}`}
        </span>
        {data.submitSource && (
          <span className="text-muted-foreground">
            · {SUBMIT_SOURCE_LABEL[data.submitSource] ?? data.submitSource}
          </span>
        )}
        <span className="text-muted-foreground">
          ·{" "}
          {published ?
            `Results published ${format(data.exam.resultsPublishedAt ?? new Date(), "MMM d, yyyy")}`
          : "Results not published"}
        </span>
      </div>

      {data.canManage && published && (
        <p className="bg-warning-surface text-warning rounded-md px-4 py-3 text-sm">
          Marks are locked while results are published. Withdraw results on the
          exam&apos;s results page to change them.
        </p>
      )}

      {data.canManage && published && <PublishResultReportButton attemptId={data.id} />}

      <ResultReview
        audience="staff"
        totalScore={data.totalScore}
        maxScore={data.maxScore}
        submittedAt={data.submittedAt?.toISOString() ?? null}
        questions={data.questions}
        answers={data.answers}
        passMarkPercent={data.exam.passMarkPercent}
        answerActions={answerActions}
      />

      {data.audits.length > 0 && (
        <section
          aria-labelledby="attempt-history"
          className="grid gap-2">
          <h2
            id="attempt-history"
            className="text-lg font-medium">
            Grading history
          </h2>
          <ul className="grid gap-1 text-sm">
            {data.audits.map((a) => (
              <li
                key={a.id}
                className="text-muted-foreground">
                {format(a.createdAt, "MMM d, HH:mm")} · {ACTION_LABEL[a.action] ?? a.action}{" "}
                {formatScore(a.previousScore)} → {formatScore(a.newScore)} by {a.by}
                {a.reason && ` — ${a.reason}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
};
