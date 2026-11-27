import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  CalendarClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  RotateCcwIcon,
  TargetIcon,
} from "lucide-react";
import { requireRole } from "@/server/session";
import { getStudentExams } from "@/server/studentExamActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { StatCard } from "@/components/Dashboard/StatCard";
import { DashboardShellSkeleton } from "@/components/Dashboard/DashboardShellSkeleton";
import { CandidateExamAction } from "@/components/Student/CandidateExamAction";
import { CandidateExamStateBadge } from "@/components/Student/CandidateExamStateBadge";
import { groupCandidateExams } from "@/lib/exam/candidateBuckets";
import {
  formatDisplayDateTime,
  formatDurationMinutes,
} from "@/lib/date/format";
import type { StudentExamListItem } from "@/server/studentExamActions";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Student dashboard",
};

const StudentDashboard = () => (
  <Suspense fallback={<DashboardShellSkeleton />}>
    <StudentDashboardContent />
  </Suspense>
);

const examTiming = (exam: StudentExamListItem) => {
  const { eligibility } = exam;
  if (eligibility.state === "in_progress" && eligibility.attemptDeadline)
    return `Your attempt ends ${formatDisplayDateTime(eligibility.attemptDeadline)}`;
  if (eligibility.bucket === "upcoming" && exam.startTime)
    return `Opens ${formatDisplayDateTime(exam.startTime)}`;
  if (eligibility.bucket === "completed" && exam.attempt?.submittedAt)
    return `Submitted ${formatDisplayDateTime(exam.attempt.submittedAt)}`;
  if (eligibility.state === "missed" && exam.endTime)
    return `Closed ${formatDisplayDateTime(exam.endTime)}`;
  if (exam.endTime) return `Closes ${formatDisplayDateTime(exam.endTime)}`;
  return null;
};

const ExamRow = ({ exam }: { exam: StudentExamListItem }) => {
  const timing = examTiming(exam);
  const score =
    exam.attempt && exam.eligibility.action === "view_result" ?
      `${exam.attempt.totalScore ?? exam.attempt.autoScore ?? 0}/${exam.attempt.maxScore}`
    : null;

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium break-words">{exam.title}</p>
          <CandidateExamStateBadge state={exam.eligibility.state} />
        </div>
        <p className="text-muted-foreground text-xs">
          {formatDurationMinutes(exam.duration)} · {exam._count.questions}{" "}
          questions
          {timing && ` · ${timing}`}
          {score && ` · Score ${score}`}
        </p>
      </div>
      <CandidateExamAction
        examId={exam.id}
        attemptId={exam.attempt?.id ?? null}
        eligibility={exam.eligibility}
      />
    </div>
  );
};

const BucketCard = ({
  title,
  description,
  empty,
  exams,
  footer,
}: {
  title: string;
  description: string;
  empty: string;
  exams: StudentExamListItem[];
  footer?: ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3">
      {exams.length === 0 ?
        <p className="text-muted-foreground text-sm">{empty}</p>
      : exams.map((exam) => (
          <ExamRow
            key={exam.id}
            exam={exam}
          />
        ))
      }
      {footer}
    </CardContent>
  </Card>
);

const StudentDashboardContent = async () => {
  const session = await requireRole("student");
  const { exams } = await getStudentExams();
  const { available, upcoming, completed } = groupCandidateExams(exams);

  const inProgress = available.filter(
    (e) => e.eligibility.state === "in_progress",
  );
  const finished = completed.filter(
    (e) => e.eligibility.action === "view_result" && e.attempt,
  );
  const pctScores = finished
    .map((e) => e.attempt!)
    .filter((a) => a.maxScore > 0)
    .map((a) => ((a.totalScore ?? a.autoScore ?? 0) / a.maxScore) * 100);
  const avgPct =
    pctScores.length > 0 ?
      `${Math.round(pctScores.reduce((s, p) => s + p, 0) / pctScores.length)}%`
    : "—";

  const viewAll = (
    <DashboardLink
      href="/student/exams"
      variant="outline">
      All examinations
    </DashboardLink>
  );

  return (
    <section className="grid gap-6">
      <DashboardIntro
        title={`Welcome back, ${session.user.name}`}
        action={
          <>
            <DashboardLink href="/student/exams">
              <FileTextIcon aria-hidden="true" /> My exams
            </DashboardLink>
            <DashboardLink
              href="/student/results"
              variant="outline">
              <GraduationCapIcon aria-hidden="true" /> My results
            </DashboardLink>
          </>
        }>
        Track your exam schedule and pick up where you left off.
      </DashboardIntro>

      <div className="dashboard-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={<FileTextIcon />}
          label="Available now"
          value={available.length}
        />
        <StatCard
          icon={<RotateCcwIcon />}
          label="In progress"
          value={inProgress.length}
        />
        <StatCard
          icon={<CalendarClockIcon />}
          label="Upcoming"
          value={upcoming.length}
        />
        <StatCard
          icon={<TargetIcon />}
          label="Average score"
          value={avgPct}
        />
      </div>

      <div className="dashboard-section grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {exams.length === 0 ?
          <Card className="p-8 text-center">
            <GraduationCapIcon
              aria-hidden="true"
              className="text-muted-foreground mx-auto mb-3 size-8"
            />
            <p className="text-muted-foreground mb-1">
              You haven&apos;t been assigned any exams yet.
            </p>
            <p className="text-muted-foreground text-xs">
              Contact your examiner to get started.
            </p>
          </Card>
        : <div className="grid min-w-0 gap-4">
            <BucketCard
              title="Available"
              description="Open now — start or resume."
              empty="No examinations are open right now."
              exams={available}
            />
            <BucketCard
              title="Upcoming"
              description="Scheduled and not yet open."
              empty="No upcoming examinations."
              exams={upcoming.slice(0, 5)}
            />
            <BucketCard
              title="Completed"
              description="Submitted attempts and closed examinations."
              empty="No completed examinations yet."
              exams={completed.slice(0, 5)}
              footer={viewAll}
            />
          </div>
        }
        <Card>
          <CardHeader>
            <CardTitle>Assessment progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdown
              items={[
                { label: "Upcoming", count: upcoming.length, tone: "info" },
                {
                  label: "Ready to start",
                  count: available.filter(
                    (exam) => exam.eligibility.action === "start",
                  ).length,
                },
                {
                  label: "In progress",
                  count: inProgress.length,
                  tone: "warning",
                },
                {
                  label: "Closed or completed",
                  count: completed.length,
                  tone: "success",
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default StudentDashboard;
