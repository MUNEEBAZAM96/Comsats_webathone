import {
  DashboardShellSkeleton,
  DashboardSkeleton,
} from "@/components/Dashboard/DashboardShellSkeleton";
import { QuietReveal } from "@/components/Providers/QuietReveal";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { StatusBadge } from "@/components/Results/StatusBadge";
import { StatCard } from "@/components/Dashboard/StatCard";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { Card, CardContent, CardHeader } from "@/components/shadcnui/card";
import prisma from "@/lib/database/dbClient";
import { requireRole } from "@/server/session";
import { format } from "date-fns";
import {
  BookOpenIcon,
  FileTextIcon,
  GraduationCapIcon,
  ArrowUpRightIcon,
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
      <QuietReveal>
        <DashboardIntro
          title="Admin overview"
          action={
            <DashboardLink href="/admin/exams/new">
              <PlusIcon aria-hidden="true" /> Create Exam
            </DashboardLink>
          }>
          Manage exams and review platform activity.
        </DashboardIntro>
      </QuietReveal>

      <Suspense fallback={<DashboardSkeleton />}>
        <AdminDashboardStats />
      </Suspense>

      <section
        className="grid gap-4"
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
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<UsersIcon className="text-primary size-6" />}
          label="Total users"
          value={totalUsers}
        />
        <StatCard
          icon={<FileTextIcon className="text-primary size-6" />}
          label="Total examinations"
          value={totalExams}
        />
        <StatCard
          icon={<BookOpenIcon className="text-primary size-6" />}
          label="Question bank items"
          value={questionCount}
        />
        <StatCard
          icon={<GraduationCapIcon className="text-primary size-6" />}
          label="Total attempts"
          value={totalAttempts}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                Recent exams
              </h2>
            </CardHeader>
            <CardContent>
              {recentExams.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No exams created yet.
                </p>
              ) : (
                <div className="grid gap-2">
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
                          exam.status === "published"
                            ? "bg-info-surface text-info"
                            : undefined
                        }>
                        {exam.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                Recent attempts
              </h2>
            </CardHeader>
            <CardContent>
              {recentAttempts.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No attempts yet.
                </p>
              ) : (
                <div className="grid gap-2">
                  {recentAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="border-border flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        {attempt.status === "in_progress" ? (
                          <p className="break-words text-sm font-medium">
                            {attempt.user.name}
                          </p>
                        ) : (
                          <Link
                            className="break-words text-sm font-medium underline-offset-4 hover:underline"
                            href={`/admin/results/${attempt.id}`}>
                            {attempt.user.name}
                          </Link>
                        )}
                        <p className="break-words text-xs text-muted-foreground">
                          {attempt.exam.title}
                          {attempt.submittedAt &&
                            ` · ${format(attempt.submittedAt, "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {attempt.status !== "in_progress" &&
                          attempt.autoScore !== null && (
                            <span className="text-xs font-medium">
                              {attempt.autoScore}/{attempt.maxScore}
                            </span>
                          )}
                        <StatusBadge status={attempt.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-semibold">
                User distribution
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {userCounts.map((g) => (
                  <div
                    key={g.role}
                    className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm capitalize">
                      {g.role}
                    </span>
                    <span className="font-medium">{g._count}</span>
                  </div>
                ))}
              </div>
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
