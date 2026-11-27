import type { Metadata, Route } from "next";
import { Suspense } from "react";
import {
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  UsersIcon,
} from "lucide-react";
import { requireRole } from "@/server/session";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import {
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { ActivityDashboardSkeleton } from "@/components/Dashboard/DashboardShellSkeleton";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { StatCard } from "@/components/Dashboard/StatCard";
import prisma from "@/lib/database/dbClient";
import type { Route } from "next";
import { Suspense } from "react";
import { DashboardShellSkeleton } from "@/components/Dashboard/DashboardShellSkeleton";

export const metadata: Metadata = {
  title: "Proctor Dashboard",
  description: "Monitor exams and student activity",
};

const ProctorDashboardPage = () => (
  <Suspense fallback={<DashboardShellSkeleton />}>
    <ProctorDashboardContent />
  </Suspense>
);

const ProctorDashboardContent = async () => {
  const session = await requireRole("proctor");

  const proctorAssignments = await prisma.examProctor.findMany({
    where: { proctorId: session.user.id },
    orderBy: { assignedAt: "desc" },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          status: true,
          _count: { select: { assignments: true, attempts: true } },
        },
      },
    },
  });

  const examIds = proctorAssignments.map((pa) => pa.examId);

  const activeAttempts = examIds.length
    ? await prisma.examAttempt.groupBy({
        by: ["examId"],
        where: { examId: { in: examIds }, status: "in_progress" },
        _count: true,
      })
    : [];
  const activeCountByExam = new Map(
    activeAttempts.map(({ examId, _count }) => [examId, _count]),
  );
  const inProgressCount = activeAttempts.reduce(
    (sum, exam) => sum + exam._count,
    0,
  );

  const totalExams = proctorAssignments.length;
  const totalStudents = proctorAssignments.reduce(
    (sum, pa) => sum + pa.exam._count.assignments,
    0,
  );
  const totalAttempts = proctorAssignments.reduce(
    (sum, pa) => sum + pa.exam._count.attempts,
    0,
  );

  const examsWithActivity = proctorAssignments
    .filter(({ examId }) => activeCountByExam.has(examId))
    .sort(
      (a, b) =>
        (activeCountByExam.get(b.examId) ?? 0) -
        (activeCountByExam.get(a.examId) ?? 0),
    );
  const featuredExam =
    examsWithActivity[0] ??
    proctorAssignments.find(({ exam }) => exam.status === "published") ??
    proctorAssignments[0];

  return (
    <section className="grid gap-6">
      <DashboardIntro
        title="Proctor overview"
        action={
          featuredExam && (
            <MonitorLink
              examId={featuredExam.examId}
              primary
            />
          )
        }>
        Monitor assigned exams and review candidate progress.
      </DashboardIntro>

      <DashboardSection
        id="exam-activity"
        title="Exam activity">
        {examsWithActivity.length ? (
          <ul>
            {examsWithActivity.map(({ examId, exam }) => (
              <DashboardRow key={examId}>
                <div className="min-w-0 flex-1 basis-44">
                  <p className="break-words font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeCountByExam.get(examId)} in progress ·{" "}
                    {exam._count.attempts} total attempts
                  </p>
                </div>
                <MonitorLink examId={examId} />
              </DashboardRow>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {totalExams
              ? "No attempts are currently marked in progress."
              : "You haven’t been assigned to any exams yet."}
          </p>
        )}
      </DashboardSection>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<FileTextIcon className="size-6 text-primary" />}
          label="Assigned Exams"
          value={totalExams}
        />
        <StatCard
          icon={<UsersIcon className="size-6 text-primary" />}
          label="Student Assignments"
          value={totalStudents}
        />
        <StatCard
          icon={<GraduationCapIcon className="size-6 text-primary" />}
          label="Total Attempts"
          value={totalAttempts}
        />
        <StatCard
          icon={<EyeIcon className="size-6 text-primary" />}
          label="In Progress"
          value={inProgressCount}
        />
      </div>

      {totalExams > 0 && (
        <DashboardSection
          id="assigned-exams"
          title="Assigned exams">
          <ul>
            {proctorAssignments.map(({ examId, exam }) => (
              <DashboardRow key={examId}>
                <div className="min-w-0 flex-1 basis-44">
                  <p className="break-words font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam._count.assignments} students · {exam._count.attempts}{" "}
                    total attempts
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="capitalize">
                    {exam.status}
                  </Badge>
                  <MonitorLink examId={examId} />
                </div>
              </DashboardRow>
            ))}
          </ul>
        </DashboardSection>
      )}
    </section>
  );
};

export default ProctorDashboardPage;

