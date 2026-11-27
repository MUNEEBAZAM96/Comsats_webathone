import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { formatDisplayDateTime, formatDurationMinutes } from "@/lib/date/format";
import type { StudentExamListItem } from "@/server/studentExamActions";
import { CandidateExamAction } from "./CandidateExamAction";
import { CandidateExamStateBadge } from "./CandidateExamStateBadge";

export const StudentExamCard = ({ exam }: { exam: StudentExamListItem }) => {
  const { eligibility, attempt } = exam;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <CardTitle className="text-lg break-words">{exam.title}</CardTitle>
            {exam.description && (
              <CardDescription className="break-words">
                {exam.description}
              </CardDescription>
            )}
          </div>
          <CandidateExamStateBadge state={eligibility.state} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
          <dl className="text-muted-foreground grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-1">
              <dt>Duration:</dt>
              <dd>{formatDurationMinutes(exam.duration)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Questions:</dt>
              <dd>{exam._count.questions}</dd>
            </div>
            {exam.startTime && (
              <div className="flex gap-1">
                <dt>Opens:</dt>
                <dd>{formatDisplayDateTime(exam.startTime)}</dd>
              </div>
            )}
            {exam.endTime && (
              <div className="flex gap-1">
                <dt>Closes:</dt>
                <dd>{formatDisplayDateTime(exam.endTime)}</dd>
              </div>
            )}
            {eligibility.state === "in_progress" && eligibility.attemptDeadline && (
              <div className="flex gap-1 sm:col-span-2">
                <dt>Your attempt ends:</dt>
                <dd className="text-foreground font-medium">
                  {formatDisplayDateTime(eligibility.attemptDeadline)}
                </dd>
              </div>
            )}
            {attempt?.submittedAt && (
              <div className="flex gap-1">
                <dt>Submitted:</dt>
                <dd>{formatDisplayDateTime(attempt.submittedAt)}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>Examiner:</dt>
              <dd>{exam.createdBy.name}</dd>
            </div>
          </dl>
          <CandidateExamAction
            examId={exam.id}
            attemptId={attempt?.id ?? null}
            eligibility={eligibility}
          />
        </div>
      </CardContent>
    </Card>
  );
};
