import type { Metadata, Route } from "next";
import { addMinutes, format, isAfter, isBefore } from "date-fns";
import { Suspense } from "react";
import Link from "next/link";
import {
  FileTextIcon,
  GraduationCapIcon,
  PlayIcon,
  RotateCcwIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/Dashboard/DashboardShellSkeleton";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Student dashboard",
};

const StudentDashboard = () => (
  <Suspense fallback={<DashboardShellSkeleton />}>
    <StudentDashboardContent />
  </Suspense>
);

const StudentDashboardContent = async () => {
  const session = await requireRole("student");
  const userId = session.user.id;

const StudentDashboardContent = async () => {
  const { user } = await requireRole("student");
  const userId = user.id;
  const [assignments, attempts, recentAttempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { userId },
      orderBy: { assignedAt: "desc" },
      select: {
        examId: true,
        exam: {
          select: {
            title: true,
            status: true,
            duration: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId },
      select: {
        examId: true,
        status: true,
        autoScore: true,
        maxScore: true,
        startedAt: true,
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId, status: { in: ["submitted", "graded"] } },
      take: 5,
      orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
      select: {
        id: true,
        submittedAt: true,
        status: true,
        totalScore: true,
        autoScore: true,
        maxScore: true,
        exam: { select: { title: true } },
      },
    }),
  ]);

  const now = new Date();
  const completedAttempts = attempts.filter(
    ({ status }) => status === "submitted" || status === "graded",
  );
  const inProgressAttempts = attempts.filter(
    ({ status }) => status === "in_progress",
  );
  const attemptByExam = new Map(
    attempts.map((attempt) => [attempt.examId, attempt]),
  );
  const publishedAssignments = assignments.filter(
    ({ exam }) => exam.status === "published",
  );
  const pendingExams = publishedAssignments.filter(
    ({ examId, exam }) =>
      !attemptByExam.has(examId) &&
      (!exam.startTime || !isBefore(now, exam.startTime)) &&
      (!exam.endTime || !isAfter(now, exam.endTime)),
  );
  const upcomingExams = publishedAssignments.filter(
    ({ examId, exam }) =>
      !attemptByExam.has(examId) &&
      exam.startTime &&
      isBefore(now, exam.startTime),
  );
  // Match startExam's resume rules, including the attempt's own time limit.
  const resumableExams = publishedAssignments.filter(({ examId, exam }) => {
    const attempt = attemptByExam.get(examId);
    return (
      attempt?.status === "in_progress" &&
      (!exam.endTime || !isAfter(now, exam.endTime)) &&
      !isAfter(now, addMinutes(attempt.startedAt, exam.duration))
    );
  });
  const nextExam = resumableExams[0] ?? pendingExams[0];
  const average = completedAttempts.length
    ? Math.round(
        completedAttempts.reduce((sum, a) => sum + (a.autoScore ?? 0), 0) /
          completedAttempts.length,
      )
    : null;
  const averageMax = completedAttempts.length
    ? Math.round(
        completedAttempts.reduce((sum, a) => sum + (a.maxScore ?? 1), 0) /
          completedAttempts.length,
      )
    : null;

  return (
    <section className="grid gap-6">
      <DashboardIntro title="Candidate overview">
        Open your assigned exams and review your results.
      </DashboardIntro>

      <DashboardSection
        id="next-exam"
        title="Next action"
        action={
          nextExam && (
            <ExamLink
              examId={nextExam.examId}
              resume={resumableExams.length > 0}
              primary
            />
          )
        }>
        <p className="break-words text-sm text-muted-foreground">
          {nextExam ? (
            <>
              <span className="font-semibold text-foreground">
                {nextExam.exam.title}
              </span>{" "}
              · {nextExam.exam.duration} min
            </>
          ) : assignments.length ? (
            "No exams are available to start or resume right now."
          ) : (
            "You haven’t been assigned any exams yet. Contact your examiner if you’re expecting an exam."
          )}
        </p>
      </DashboardSection>

      {resumableExams.length > 0 && (
        <DashboardSection
          id="continue-exams"
          title="Continue exams">
          <ul>
            {resumableExams.map(({ examId, exam }) => (
              <DashboardRow key={examId}>
                <p className="min-w-0 flex-1 basis-40 break-words font-medium">
                  {exam.title}
                </p>
                <ExamLink
                  examId={examId}
                  resume
                />
              </DashboardRow>
            ))}
          </ul>
        </DashboardSection>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DashboardSection
          id="available-exams"
          title="Available exams">
          {pendingExams.length ? (
            <ul>
              {pendingExams.map(({ examId, exam }) => (
                <DashboardRow key={examId}>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="break-words font-medium">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {exam.duration} min
                      {exam.endTime &&
                        ` · ends ${format(exam.endTime, "MMM d, yyyy 'at' p")}`}
                    </p>
                  </div>
                  <ExamLink
                    examId={examId}
                    resume={false}
                  />
                </DashboardRow>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No exams are ready to start.
            </p>
          )}
        </DashboardSection>

        <DashboardSection
          id="upcoming-exams"
          title="Upcoming exams">
          {upcomingExams.length ? (
            <ul>
              {upcomingExams.map(({ examId, exam }) => (
                <DashboardRow key={examId}>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="break-words font-medium">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {exam.duration} min
                      {exam.startTime &&
                        ` · starts ${format(exam.startTime, "MMM d, yyyy 'at' p")}`}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Scheduled
                  </span>
                </DashboardRow>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You have no upcoming exams.
            </p>
          )}
        </DashboardSection>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<FileTextIcon className="size-6 text-primary" />}
          label="Pending Exams"
          value={pendingExams.length}
        />
        <StatCard
          icon={<RotateCcwIcon className="size-6 text-primary" />}
          label="In Progress"
          value={inProgressAttempts.length}
        />
        <StatCard
          icon={<GraduationCapIcon className="size-6 text-primary" />}
          label="Completed"
          value={completedAttempts.length}
        />
        <StatCard
          icon={<TargetIcon className="size-6 text-primary" />}
          label="Avg Auto Score"
          value={average !== null ? `${average}/${averageMax}` : "—"}
        />
      </div>

      <DashboardSection
        id="recent-results"
        title="Recent results">
        {recentAttempts.length ? (
          <ul>
            {recentAttempts.map((attempt) => (
              <DashboardRow key={attempt.id}>
                <div className="min-w-0 flex-1 basis-40">
                  <Link
                    className="break-words text-sm font-medium underline-offset-4 hover:underline"
                    href={`/student/results/${attempt.id}`}>
                    {attempt.exam.title}
                  </Link>
                  {attempt.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      {format(attempt.submittedAt, "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {attempt.totalScore ?? attempt.autoScore ?? "—"}/
                    {attempt.maxScore}
                  </span>
                  <StatusBadge status={attempt.status} />
                </div>
              </DashboardRow>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Complete an exam to see your results here.
          </p>
        )}
      </DashboardSection>
    </section>
  );
};

const StudentDashboard = () => (
  <Suspense fallback={<ActivityDashboardSkeleton />}>
    <StudentDashboardContent />
  </Suspense>
);

export default StudentDashboard;
