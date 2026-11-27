import { Button } from "@/components/shadcnui/button";
import { PublishResultsControls } from "@/components/Grading/PublishResultsControls";
import ResultSettingsForm from "@/components/Grading/ResultSettingsForm";
import type { ResultReveal } from "@/lib/zodSchema";
import { SUBMIT_SOURCE_LABEL } from "@/components/Monitoring/labels";
import { PctBadge } from "@/components/Results/PctBadge";
import { StatusBadge } from "@/components/Results/StatusBadge";
import { ExamAnalyticsCharts } from "@/features/analytics/components/ExamAnalyticsCharts";
import { ExportResultsButtons } from "@/features/exports/components/ExportResultsButtons";
import { formatScore } from "@/lib/exam/grading";
import { loadExamAnalytics } from "@/server/analyticsActions";
import { getPublicationState } from "@/server/gradingActions";
import { getExamResults } from "@/server/resultsActions";
import { format } from "date-fns";
import { ActivityIcon, ArrowLeftIcon, ClipboardCheckIcon, EyeIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export const ExamResultsView = async ({
  examId,
  basePath,
}: {
  examId: string;
  basePath: "/admin" | "/examiner";
}) => {
  const data = await getExamResults(examId);
  const [publication, analytics] =
    data.canManage ?
      await Promise.all([getPublicationState(examId), loadExamAnalytics(examId)])
    : [null, null];

  return (
    <section className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`${basePath}/exams` as Route}>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Back to exams">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-medium">{data.examTitle}</h1>
            <p className="text-muted-foreground text-sm">
              {data.attempts.length} submitted · {data.inProgress} writing ·{" "}
              {data.pendingManual} answer{data.pendingManual === 1 ? "" : "s"} to mark
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${basePath}/exams/${examId}/grading` as Route}>
            <Button
              variant={data.pendingManual > 0 ? "default" : "outline"}
              size="lg">
              <ClipboardCheckIcon aria-hidden="true" />
              Grading
              {data.pendingManual > 0 && ` (${data.pendingManual} pending)`}
            </Button>
          </Link>
          <Link href={`${basePath}/exams/${examId}/monitor` as Route}>
            <Button
              variant="outline"
              size="lg">
              <ActivityIcon aria-hidden="true" />
              Monitor
            </Button>
          </Link>
        </div>
      </div>

      {publication && (
        <PublishResultsControls
          examId={examId}
          state={publication}
        />
      )}

      {data.canManage && !data.resultsPublishedAt && (
        <ResultSettingsForm
          examId={examId}
          resultReveal={data.resultReveal as ResultReveal}
          passMarkPercent={data.passMarkPercent}
        />
      )}

      <ExportResultsButtons examId={examId} />

      {analytics && <ExamAnalyticsCharts data={analytics} />}

      {data.attempts.length === 0 ?
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground text-lg">No results yet</p>
          <p className="text-muted-foreground text-sm">
            Students haven&apos;t submitted any attempts for this exam.
          </p>
        </div>
      : <div className="border-border overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b text-left">
                <th scope="col" className="px-4 py-3 font-medium">Student</th>
                <th scope="col" className="px-4 py-3 font-medium">Auto</th>
                <th scope="col" className="px-4 py-3 font-medium">Manual</th>
                <th scope="col" className="px-4 py-3 font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">%</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((a) => (
                <tr
                  key={a.id}
                  data-attempt={a.id}
                  className="border-border hover:bg-muted/30 border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{a.student.name}</td>
                  <td className="px-4 py-3 tabular-nums">{formatScore(a.autoScore)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatScore(a.manualScore)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {a.totalScore === null ? "Pending" : `${formatScore(a.totalScore)}/${a.maxScore}`}
                  </td>
                  <td className="px-4 py-3">
                    {a.percentage === null ? "—" : <PctBadge pct={a.percentage} />}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    {a.pendingManual > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        {a.pendingManual} to mark
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {a.submittedAt ? format(a.submittedAt, "MMM d, yyyy") : "—"}
                    {a.submitSource && a.submitSource !== "manual" && (
                      <span className="block text-xs">
                        {SUBMIT_SOURCE_LABEL[a.submitSource] ?? a.submitSource}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`${basePath}/results/${a.id}` as Route}
                      aria-label={`View ${a.student.name}'s answers`}>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        tabIndex={-1}>
                        <EyeIcon className="size-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </section>
  );
};
