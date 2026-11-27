import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import {
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { StatCard } from "@/components/Dashboard/StatCard";
import {
  ExaminerDashboardSkeleton,
  ExaminerShellSkeleton,
} from "@/components/Examiner/ExaminerShellSkeleton";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import prisma from "@/lib/database/dbClient";
import { requireRole } from "@/server/session";
import { format } from "date-fns";
import {
  BookOpenIcon,
  FileTextIcon,
  GraduationCapIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Examiner dashboard",
};

const ExaminerDashboard = () => (
  <section className="grid gap-6">
    <Suspense fallback={<ExaminerShellSkeleton />}>
      <ExaminerDashboardContent />
    </Suspense>
  </section>
);

const ExaminerDashboardContent = async () => {
  const session = await requireRole("examiner");
  const userId = session.user.id;

  return (
    <>
      <DashboardIntro
        title="Examiner overview"
        action={
          <DashboardLink href="/examiner/exams/new">
            <PlusIcon aria-hidden="true" /> Create Exam
          </DashboardLink>
        }>
        Prepare exams, assign candidates, and review results for your exams.
      </DashboardIntro>

      <Suspense fallback={<ExaminerDashboardSkeleton />}>
        <ExaminerDashboardStats userId={userId} />
      </Suspense>
    </>
  );
};

const ExaminerDashboardStats = async ({ userId }: { userId: string }) => {
  "use cache";
  cacheLife("minutes");
  cacheTag("examiner-dashboard");

  const [examCounts, questionCount, totalStudents, attemptCounts, recentExams] =
    await Promise.all([
      prisma.exam.groupBy({
        by: ["status"],
        where: { createdById: userId },
        _count: true,
      }),
      prisma.bankQuestion.count({ where: { createdById: userId } }),
      prisma.examAssignment.findMany({
        where: { exam: { createdById: userId } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.examAttempt.findMany({
        where: { exam: { createdById: userId } },
        select: { status: true },
      }),
      prisma.exam.findMany({
        where: { createdById: userId },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          _count: {
            select: { questions: true, assignments: true, attempts: true },
          },
        },
      }),
    ]);

  const totalExams = examCounts.reduce((sum, g) => sum + g._count, 0);
  const publishedExams =
    examCounts.find((g) => g.status === "published")?._count ?? 0;
  const draftExams = examCounts.find((g) => g.status === "draft")?._count ?? 0;
  const totalAttempts = attemptCounts.length;
  const studentCount = totalStudents.length;

  return (
    <>
      <div className="dashboard-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={<FileTextIcon />}
          label="My Exams"
          value={totalExams}
        />
        <StatCard
          icon={<BookOpenIcon />}
          label="Bank Questions"
          value={questionCount}
        />
        <StatCard
          icon={<UsersIcon />}
          label="Students Assigned"
          value={studentCount}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Total Attempts"
          value={totalAttempts}
        />
      </div>

      <div className="dashboard-section grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <DashboardSection
          id="examiner-exams"
          title="Your exams">
          {recentExams.length ?
            <ul>
              {recentExams.map((exam) => (
                <DashboardRow key={exam.id}>
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="break-words font-medium">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {exam._count.questions} questions &middot;{" "}
                      {exam._count.assignments} students &middot;{" "}
                      {exam._count.attempts} attempts &middot;{" "}
                      {format(exam.createdAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="capitalize">
                      {exam.status}
                    </Badge>
                    <DashboardLink
                      href={`/examiner/exams/${exam.id}` as Route}
                      variant="outline">
                      Manage Exam
                    </DashboardLink>
                  </div>
                </DashboardRow>
              ))}
            </ul>
          : <p className="text-sm text-muted-foreground">
              Create your first exam to start preparing an assessment.
            </p>
          }
        </DashboardSection>

        <DashboardSection
          id="examiner-preparation"
          title="Exam preparation">
          <StatusBreakdown
            items={[
              { label: "Draft", count: draftExams, tone: "warning" },
              { label: "Published", count: publishedExams, tone: "info" },
              {
                label: "Completed",
                count:
                  examCounts.find(({ status }) => status === "completed")
                    ?._count ?? 0,
                tone: "success",
              },
            ]}
          />
          <DashboardLink
            href="/examiner/questions"
            variant="outline"
            className="mt-4">
            <BookOpenIcon aria-hidden="true" /> Question Bank
          </DashboardLink>
        </DashboardSection>
      </div>
    </>
  );
};

export default ExaminerDashboard;
