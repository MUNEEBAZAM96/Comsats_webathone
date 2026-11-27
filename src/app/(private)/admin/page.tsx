import {
  DashboardShellSkeleton,
  DashboardSkeleton,
} from "@/components/Dashboard/DashboardShellSkeleton";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { StatusBadge } from "@/components/Results/StatusBadge";
import { StatCard } from "@/components/Dashboard/StatCard";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { Card, CardContent, CardHeader } from "@/components/shadcnui/card";
import prisma from "@/lib/database/dbClient";
import { formatScore } from "@/lib/exam/grading";
import { requireRole } from "@/server/session";
import { format } from "date-fns";
import {
  BookOpenIcon,
  FileTextIcon,
  GraduationCapIcon,
  ChartNoAxesColumnIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Admin dashboard",
};

const AdminDashboard = () => (
  <section className="grid gap-6">
    <Suspense fallback={<DashboardShellSkeleton />}>
      <AdminDashboardContent />
    </Suspense>
  </section>
);

const AdminDashboardContent = async () => {
  // The admin layout redirects other roles but does not stop this page from
  // rendering, so the page checks the role before any stats are loaded.
  await requireRole("admin");

  return (
    <>
      <DashboardIntro
        title="Admin overview"
        action={
          <DashboardLink href="/admin/exams/new">
            <PlusIcon aria-hidden="true" /> Create Exam
          </DashboardLink>
        }>
        Manage exams and review platform activity.
      </DashboardIntro>

      <Suspense fallback={<DashboardSkeleton />}>
        <AdminDashboardStats />
      </Suspense>

      <section
        className="dashboard-section grid gap-4"
        aria-labelledby="admin-quick-actions">
        <h2
          id="admin-quick-actions"
          className="text-lg font-semibold">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { href: "/admin/users", title: "Manage users", icon: UsersIcon },
            {
              href: "/admin/questions",
              title: "Question bank",
              icon: BookOpenIcon,
            },
            {
              href: "/admin/results",
              title: "View results",
              icon: ChartNoAxesColumnIcon,
            },
          ].map(({ href, title, icon: Icon }) => (
            <Link
              key={href}
              href={href as Route}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm font-semibold transition-colors hover:border-input hover:bg-secondary focus-visible:outline-2">
              <Icon
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
              <span className="min-w-0 flex-1">{title}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
};

const AdminDashboardStats = async () => {
  "use cache";
  cacheLife("minutes");
  cacheTag("admin-dashboard");

  const [
    userCounts,
    examCounts,
    questionCount,
    attemptCounts,
    recentExams,
    recentAttempts,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.exam.groupBy({ by: ["status"], _count: true }),
    prisma.bankQuestion.count(),
    prisma.examAttempt.groupBy({ by: ["status"], _count: true }),
    prisma.exam.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.examAttempt.findMany({
      take: 5,
      orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
      select: {
        id: true,
        status: true,
        autoScore: true,
        totalScore: true,
        maxScore: true,
        submittedAt: true,
        user: { select: { name: true } },
        exam: { select: { title: true, id: true } },
      },
    }),
  ]);

  const totalUsers = userCounts.reduce((sum, g) => sum + g._count, 0);
  const totalExams = examCounts.reduce((sum, g) => sum + g._count, 0);
  const draftExams = examCounts.find((g) => g.status === "draft")?._count ?? 0;
  const publishedExams =
    examCounts.find((g) => g.status === "published")?._count ?? 0;
  const totalAttempts = attemptCounts.reduce((sum, g) => sum + g._count, 0);
  const inProgressAttempts =
    attemptCounts.find((g) => g.status === "in_progress")?._count ?? 0;
  const completedAttempts = attemptCounts
    .filter(({ status }) => status === "submitted" || status === "graded")
    .reduce((sum, { _count }) => sum + _count, 0);

  return (
    <>
      <div className="dashboard-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={<UsersIcon />}
          label="Total users"
          value={totalUsers}
        />
        <StatCard
          icon={<FileTextIcon />}
          label="Total examinations"
          value={totalExams}
        />
        <StatCard
          icon={<BookOpenIcon />}
          label="Question bank items"
          value={questionCount}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Total attempts"
          value={totalAttempts}
        />
      </div>

      <div className="dashboard-section grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                Recent exams
              </h2>
            </CardHeader>
            <CardContent>
              {recentExams.length === 0 ?
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No exams created yet.
                </p>
              : <div className="grid gap-2">
                  {recentExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="border-border flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/exams/${exam.id}` as Route}
                          className="break-words text-sm font-medium underline-offset-4 hover:underline">
                          {exam.title}
                        </Link>
                        <p className="break-words text-xs text-muted-foreground">
                          {exam.createdBy.name} &middot;{" "}
                          {format(exam.createdAt, "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          exam.status === "published" ?
                            "bg-info-surface text-info"
                          : undefined
                        }>
                        {exam.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                Recent attempts
              </h2>
            </CardHeader>
            <CardContent>
              {recentAttempts.length === 0 ?
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No attempts yet.
                </p>
              : <div className="grid gap-2">
                  {recentAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="border-border flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        {attempt.status === "in_progress" ?
                          <p className="break-words text-sm font-medium">
                            {attempt.user.name}
                          </p>
                        : <Link
                            className="break-words text-sm font-medium underline-offset-4 hover:underline"
                            href={`/admin/results/${attempt.id}`}>
                            {attempt.user.name}
                          </Link>
                        }
                        <p className="break-words text-xs text-muted-foreground">
                          {attempt.exam.title}
                          {attempt.submittedAt &&
                            ` · ${format(attempt.submittedAt, "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {attempt.status !== "in_progress" && (
                          <span className="text-xs font-medium">
                            {attempt.totalScore === null ?
                              "Marking pending"
                            : `${formatScore(attempt.totalScore)}/${attempt.maxScore}`}
                          </span>
                        )}
                        <StatusBadge status={attempt.status} />
                      </div>
                    </div>
                  ))}
                </div>
              }
            </CardContent>
          </Card>
        </div>
        <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                User distribution
              </h2>
            </CardHeader>
            <CardContent>
              {userCounts.length ?
                <StatusBreakdown
                  items={userCounts.map(({ role, _count }) => ({
                    label:
                      role ?
                        role === "student" ?
                          "Candidate"
                        : role.charAt(0).toUpperCase() + role.slice(1)
                      : "Unassigned",
                    count: _count,
                  }))}
                />
              : <p className="text-sm text-muted-foreground">
                  No users to show.
                </p>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                Exam and attempt status
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Published
                  </span>
                  <span className="font-medium">{publishedExams}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Draft</span>
                  <span className="font-medium">{draftExams}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Attempts in progress
                  </span>
                  <span className="font-medium">{inProgressAttempts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Completed attempts
                  </span>
                  <span className="font-medium">{completedAttempts}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
