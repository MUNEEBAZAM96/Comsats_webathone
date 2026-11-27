import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CalendarClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  RotateCcwIcon,
  TargetIcon,
} from "lucide-react";
import { format } from "date-fns";
import { requireRole } from "@/server/session";
import {
  getStudentExams,
  type StudentExamListItem,
} from "@/server/studentExamActions";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import {
  DashboardEmpty,
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { StatCard } from "@/components/Dashboard/StatCard";
import { DashboardTrend } from "@/components/Dashboard/DashboardTrend";
import { DashboardShellSkeleton } from "@/components/Dashboard/DashboardShellSkeleton";
import { CandidateExamAction } from "@/components/Student/CandidateExamAction";
import { CandidateExamStateBadge } from "@/components/Student/CandidateExamStateBadge";
import { groupCandidateExams } from "@/lib/exam/candidateBuckets";
import { formatScore } from "@/lib/exam/grading";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDurationMinutes,
} from "@/lib/date/format";

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
  if (eligibility.state === "time_up" && eligibility.attemptDeadline)
    return `Attempt expired ${formatDisplayDateTime(eligibility.attemptDeadline)}`;
  if (exam.attempt?.submittedAt)
    return `Submitted ${formatDisplayDateTime(exam.attempt.submittedAt)}`;
  if (exam.endTime)
    return `${eligibility.state === "missed" ? "Closed" : "Closes"} ${formatDisplayDateTime(exam.endTime)}`;
  return null;
};

const ExamRow = ({ exam }: { exam: StudentExamListItem }) => {
  const timing = examTiming(exam);
  const result =
    exam.attempt && exam.eligibility.action === "view_result"
      ? exam.resultsVisible && exam.attempt.totalScore != null
        ? `Score ${formatScore(exam.attempt.totalScore)}/${exam.attempt.maxScore}`
        : "Results not released yet"
      : null;

  return (
    <DashboardRow>
      <div className="grid min-w-0 flex-1 basis-44 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="wrap-anywhere font-semibold">{exam.title}</p>
          <CandidateExamStateBadge state={exam.eligibility.state} />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDurationMinutes(exam.duration)} &middot;{" "}
          {exam._count.questions} questions
        </p>
        {(timing || result) && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {[timing, result].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {exam.eligibility.action !== "none" && (
        <CandidateExamAction
          examId={exam.id}
          attemptId={exam.attempt?.id ?? null}
          eligibility={exam.eligibility}
        />
      )}
    </DashboardRow>
  );
};

const activityTimestamp = (exam: StudentExamListItem) =>
  (exam.attempt?.submittedAt ?? exam.endTime ?? exam.startTime)?.getTime() ?? 0;

const StudentDashboardContent = async () => {
  const session = await requireRole("student");
  const { exams } = await getStudentExams();
  const { available, upcoming, completed } = groupCandidateExams(exams);
  const inProgress = available.filter(
    ({ eligibility }) => eligibility.state === "in_progress",
  );
  const ready = available.filter(
    ({ eligibility }) => eligibility.action === "start",
  );
  const expired = completed.filter(
    ({ eligibility }) => eligibility.state === "time_up",
  );
  const activeExams = [...available, ...expired];
  const recentActivity = completed
    .filter(({ eligibility }) => eligibility.state !== "time_up")
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a));

  const releasedScores = completed
    .flatMap(({ eligibility, resultsVisible, attempt, title }) =>
      eligibility.action === "view_result" &&
      resultsVisible &&
      attempt?.totalScore != null &&
      attempt.maxScore > 0
        ? [
            {
              date: attempt.submittedAt ?? attempt.startedAt,
              title,
              score: (attempt.totalScore / attempt.maxScore) * 100,
            },
          ]
        : [],
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const avgPct = releasedScores.length
    ? `${Math.round(releasedScores.reduce((sum, { score }) => sum + score, 0) / releasedScores.length)}%`
    : "—";

  return (
    <section className="grid gap-5">
      <DashboardIntro
        title={`Welcome back, ${session.user.name}`}
        action={
          <>
            <DashboardLink href="/student/exams">
              <FileTextIcon aria-hidden="true" /> My exams
            </DashboardLink>
            <DashboardLink href="/student/results" variant="outline">
              <GraduationCapIcon aria-hidden="true" /> My results
            </DashboardLink>
          </>
        }
      >
        Check what is open today and when your next exam starts.
      </DashboardIntro>

      <div className="dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<FileTextIcon />}
          label="Ready to start"
          value={ready.length}
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
          detail={
            releasedScores.length
              ? "Across released results"
              : "No released scores yet"
          }
        />
      </div>

      <div className="dashboard-section grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardSection
          id="candidate-exam-actions"
          title="Start, resume or finalize"
        >
          {activeExams.length ? (
            <ul>
              {activeExams.map((exam) => (
                <ExamRow key={exam.id} exam={exam} />
              ))}
            </ul>
          ) : (
            <>
              <DashboardEmpty>
                {exams.length
                  ? "You have no exams to start or resume right now."
                  : "You haven’t been assigned any exams yet."}
              </DashboardEmpty>
              <DashboardLink
                href="/student/practice"
                variant="outline"
                className="mt-3"
              >
                Practice an exam
              </DashboardLink>
            </>
          )}
        </DashboardSection>

        <DashboardSection id="candidate-schedule" title="Upcoming schedule">
          {upcoming.length ? (
            <ul>
              {upcoming.slice(0, 4).map((exam) => (
                <DashboardRow key={exam.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="grid size-11 shrink-0 place-content-center rounded-lg bg-info-surface text-center font-semibold text-info"
                    >
                      <span className="text-[0.625rem] uppercase">
                        {exam.startTime && format(exam.startTime, "MMM")}
                      </span>
                      <span className="text-base leading-none">
                        {exam.startTime && format(exam.startTime, "d")}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="wrap-anywhere font-semibold">
                        {exam.title}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {exam.startTime &&
                          formatDisplayDateTime(exam.startTime)}
                        {" · "}
                        {formatDurationMinutes(exam.duration)}
                      </p>
                    </div>
                  </div>
                </DashboardRow>
              ))}
            </ul>
          ) : (
            <DashboardEmpty>No upcoming exams are scheduled.</DashboardEmpty>
          )}
        </DashboardSection>
      </div>

      <DashboardSection id="candidate-score-trend" title="Released score trend">
        {releasedScores.length >= 2 ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Score percentages for your latest{" "}
              {Math.min(releasedScores.length, 8)} exams with released marks
            </p>
            <DashboardTrend
              variant="percentage"
              metric="Score"
              points={releasedScores
                .slice(-8)
                .map(({ date, title, score }) => ({
                  label: format(date, "MMM d"),
                  detail: `${title} · ${formatDisplayDate(date)}`,
                  value: Math.round(score * 10) / 10,
                }))}
            />
          </div>
        ) : (
          <DashboardEmpty>
            The score trend appears after you have two released scores.
          </DashboardEmpty>
        )}
      </DashboardSection>

      <DashboardSection id="candidate-activity" title="Recent exam activity">
        {recentActivity.length ? (
          <ul>
            {recentActivity.slice(0, 5).map((exam) => (
              <ExamRow key={exam.id} exam={exam} />
            ))}
          </ul>
        ) : (
          <DashboardEmpty>
            No submissions or closed exams to show yet.
          </DashboardEmpty>
        )}
      </DashboardSection>
    </section>
  );
};

export default StudentDashboard;
