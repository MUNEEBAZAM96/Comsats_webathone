import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import {
  DashboardEmpty,
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { StatCard } from "@/components/Dashboard/StatCard";
import { BankDifficultyPie } from "@/components/Dashboard/BankDifficultyPie";
import {
  ExaminerShellSkeleton,
  ExaminerDashboardSkeleton,
} from "@/components/Examiner/ExaminerShellSkeleton";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import prisma from "@/lib/database/dbClient";
import { formatDisplayDate } from "@/lib/date/format";
import { requireRole } from "@/server/session";
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
  <section className="grid gap-5">
    <Suspense fallback={<ExaminerShellSkeleton />}>
      <ExaminerDashboardContent />
    </Suspense>
  </section>
);

const ExaminerDashboardContent = async () => {
  const session = await requireRole("examiner");

  return (
    <>
      <DashboardIntro
        title="Examiner overview"
        action={
          <>
            <DashboardLink href="/examiner/exams/new">
              <PlusIcon aria-hidden="true" /> Create exam
            </DashboardLink>
            <DashboardLink href="/examiner/questions" variant="outline">
              <BookOpenIcon aria-hidden="true" /> Question bank
            </DashboardLink>
          </>
        }
      >
        Prepare assessments and pick up submissions that need marking.
      </DashboardIntro>

      <Suspense fallback={<ExaminerDashboardSkeleton />}>
        <ExaminerDashboardStats userId={session.user.id} />
      </Suspense>
    </>
  );
};

const getExaminerOverview = async (userId: string) => {
  "use cache";
  cacheLife("minutes");
  cacheTag("examiner-dashboard");

  const ownedExams = { createdById: userId };

  return Promise.all([
    prisma.exam.groupBy({ by: ["status"], where: ownedExams, _count: true }),
    prisma.bankQuestion.groupBy({
      by: ["difficulty"],
      where: { createdById: userId },
      _count: true,
    }),
    prisma.examAssignment.groupBy({
      by: ["userId"],
      where: { exam: ownedExams },
    }),
    prisma.exam.findMany({
      where: ownedExams,
      take: 5,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
};

const ExaminerDashboardStats = async ({ userId }: { userId: string }) => {
  const pendingAttempt = { status: "submitted" };
  const [
    [examCounts, bankDifficulty, assignedCandidates, recentExams],
    markingQueue,
    attemptCounts,
  ] = await Promise.all([
    getExaminerOverview(userId),
    prisma.exam.findMany({
      where: { createdById: userId, attempts: { some: pendingAttempt } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 4,
      select: {
        id: true,
        title: true,
        _count: { select: { attempts: { where: pendingAttempt } } },
      },
    }),
    prisma.examAttempt.groupBy({
      by: ["status"],
      where: { exam: { createdById: userId } },
      _count: true,
    }),
  ]);

  const totalExams = examCounts.reduce((sum, group) => sum + group._count, 0);
  const questionCount = bankDifficulty.reduce(
    (sum, group) => sum + group._count,
    0,
  );
  const countsByDifficulty = new Map<string, number>();
  for (const { difficulty, _count } of bankDifficulty) {
    const key = ["easy", "medium", "hard"].includes(difficulty)
      ? difficulty
      : "other";
    countsByDifficulty.set(key, (countsByDifficulty.get(key) ?? 0) + _count);
  }
  const statusCount = (status: string) =>
    examCounts.find((group) => group.status === status)?._count ?? 0;
  const attemptCount = attemptCounts.reduce(
    (sum, group) => sum + group._count,
    0,
  );
  const gradedCount =
    attemptCounts.find(({ status }) => status === "graded")?._count ?? 0;
  const pendingCount =
    attemptCounts.find(({ status }) => status === "submitted")?._count ?? 0;
  const submittedCount = gradedCount + pendingCount;
  const gradedShare = submittedCount ? (gradedCount / submittedCount) * 100 : 0;

  return (
    <>
      <div className="dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<FileTextIcon />}
          label="My exams"
          value={totalExams}
          detail={`${statusCount("draft")} draft · ${statusCount("published")} published · ${statusCount("completed")} completed`}
        />
        <StatCard
          icon={<BookOpenIcon />}
          label="My bank questions"
          value={questionCount}
        />
        <StatCard
          icon={<UsersIcon />}
          label="Assigned candidates"
          value={assignedCandidates.length}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Attempts"
          value={attemptCount}
        />
      </div>

      <DashboardSection id="examiner-marking" title="Marking queue">
        {markingQueue.length ? (
          <ul>
            {markingQueue.map((exam) => (
              <DashboardRow key={exam.id}>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="wrap-anywhere font-semibold">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam._count.attempts} awaiting marking
                  </p>
                </div>
                <DashboardLink
                  href={`/examiner/exams/${exam.id}/grading` as Route}
                  variant="outline"
                >
                  Grade
                </DashboardLink>
              </DashboardRow>
            ))}
          </ul>
        ) : (
          <DashboardEmpty>
            No submissions are waiting for manual marking.
          </DashboardEmpty>
        )}
      </DashboardSection>

      <div className="dashboard-section grid gap-4 lg:grid-cols-2">
        <DashboardSection
          id="examiner-marking-progress"
          title="Marking progress"
        >
          {submittedCount ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div
                aria-hidden="true"
                className="grid size-28 shrink-0 place-items-center rounded-full p-2"
                style={{
                  background: `conic-gradient(var(--success) 0 ${gradedShare}%, var(--warning) ${gradedShare}% 100%)`,
                }}
              >
                <div className="grid size-full place-content-center rounded-full bg-card text-center">
                  <span className="font-heading text-2xl font-bold tabular-nums">
                    {Math.round(gradedShare)}%
                  </span>
                  <span className="text-xs text-muted-foreground">graded</span>
                </div>
              </div>
              <div className="grid min-w-0 flex-1 basis-40 gap-3">
                <p className="text-sm text-muted-foreground">
                  Across submissions on your exams
                </p>
                <StatusBreakdown
                  items={[
                    { label: "Graded", count: gradedCount, tone: "success" },
                    {
                      label: "Awaiting marking",
                      count: pendingCount,
                      tone: "warning",
                    },
                  ]}
                />
                <p className="sr-only">
                  {Math.round(gradedShare)} percent graded.
                </p>
              </div>
            </div>
          ) : (
            <DashboardEmpty>
              Marking progress appears once candidates submit an attempt.
            </DashboardEmpty>
          )}
        </DashboardSection>
        <DashboardSection
          id="examiner-bank-difficulty"
          title="Question bank difficulty"
        >
          {questionCount ? (
            <BankDifficultyPie counts={countsByDifficulty} />
          ) : (
            <DashboardEmpty>
              Difficulty coverage appears once you add questions to the bank.
            </DashboardEmpty>
          )}
        </DashboardSection>
      </div>

      <DashboardSection
        id="examiner-exams"
        title="Recent exams"
        action={
          <DashboardLink href="/examiner/exams" variant="outline">
            All exams
          </DashboardLink>
        }
      >
        {recentExams.length ? (
          <ul>
            {recentExams.map((exam) => (
              <DashboardRow key={exam.id}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="wrap-anywhere font-semibold">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam._count.questions} questions &middot;{" "}
                    {exam._count.assignments} candidates &middot;{" "}
                    {exam._count.attempts} attempts &middot;{" "}
                    {formatDisplayDate(exam.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {exam.status}
                </Badge>
                <DashboardLink
                  href={`/examiner/exams/${exam.id}` as Route}
                  variant="outline"
                >
                  Manage exam
                </DashboardLink>
              </DashboardRow>
            ))}
          </ul>
        ) : (
          <DashboardEmpty>
            Create your first exam to start preparing an assessment.
          </DashboardEmpty>
        )}
      </DashboardSection>
    </>
  );
};

export default ExaminerDashboard;
