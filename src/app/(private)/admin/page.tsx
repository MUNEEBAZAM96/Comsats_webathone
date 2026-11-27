import {
  DashboardShellSkeleton,
  DashboardSkeleton,
} from "@/components/Dashboard/DashboardShellSkeleton";
import {
  DashboardEmpty,
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { DashboardTrend } from "@/components/Dashboard/DashboardTrend";
import { ExamStartsHeatmap } from "@/components/Dashboard/ExamStartsHeatmap";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { StatusBadge } from "@/components/Results/StatusBadge";
import { StatCard } from "@/components/Dashboard/StatCard";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { ResponsiveTable } from "@/components/Workspace/ResponsiveTable";
import prisma from "@/lib/database/dbClient";
import { formatDisplayDate, formatIsoUtc } from "@/lib/date/format";
import { formatScore } from "@/lib/exam/grading";
import { requireRole } from "@/server/session";
import { addHours, format, parseISO } from "date-fns";
import {
  BookOpenIcon,
  FileTextIcon,
  GraduationCapIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Admin dashboard",
};

const AdminDashboard = () => (
  <section className="grid gap-5">
    <Suspense fallback={<DashboardShellSkeleton />}>
      <AdminDashboardContent />
    </Suspense>
  </section>
);

const AdminDashboardContent = async () => {
  await requireRole("admin");

  return (
    <>
      <DashboardIntro
        title="Admin overview"
        action={
          <>
            <DashboardLink href="/admin/exams/new">
              <PlusIcon aria-hidden="true" /> Create exam
            </DashboardLink>
            <DashboardLink href="/admin/users" variant="outline">
              <UsersIcon aria-hidden="true" /> Manage users
            </DashboardLink>
          </>
        }
      >
        Review exam activity, candidate submissions, and account access.
      </DashboardIntro>
      <Suspense fallback={<DashboardSkeleton />}>
        <AdminDashboardStats utcDay={new Date().toISOString().slice(0, 10)} />
      </Suspense>
    </>
  );
};

const AdminDashboardStats = async ({ utcDay }: { utcDay: string }) => {
  "use cache";
  cacheLife("minutes");
  cacheTag("admin-dashboard");

  const calendarStart = parseISO(`${utcDay}T00:00:00Z`);
  const calendarEnd = addHours(calendarStart, 28 * 24);
  const calendarLastDay = formatIsoUtc(addHours(calendarEnd, -24)).slice(0, 10);

  const [
    userCounts,
    examCounts,
    questionCount,
    attemptCounts,
    recentExams,
    recentAttempts,
    dailySubmissions,
    scheduledStarts,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.exam.groupBy({ by: ["status"], _count: true }),
    prisma.bankQuestion.count(),
    prisma.examAttempt.groupBy({ by: ["status"], _count: true }),
    prisma.exam.findMany({
      take: 4,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
      orderBy: [
        { submittedAt: { sort: "desc", nulls: "last" } },
        { startedAt: "desc" },
        { id: "desc" },
      ],
      select: {
        id: true,
        status: true,
        totalScore: true,
        maxScore: true,
        submittedAt: true,
        user: { select: { name: true } },
        exam: { select: { title: true } },
      },
    }),
    prisma.$queryRaw<{ day: string; value: number }[]>`
      WITH bounds AS (
        SELECT ${utcDay}::date - 13 AS first_day, ${utcDay}::date AS last_day
      ),
      counts AS (
        SELECT "submittedAt"::date AS day, count(*)::integer AS value
        FROM "exam_attempt", bounds
        WHERE "submittedAt" >= bounds.first_day::timestamp
          AND "submittedAt" < (bounds.last_day + 1)::timestamp
          AND "status" IN ('submitted', 'graded')
        GROUP BY "submittedAt"::date
      )
      SELECT to_char(series.day, 'YYYY-MM-DD') AS day, coalesce(counts.value, 0) AS value
      FROM bounds
      CROSS JOIN LATERAL generate_series(bounds.first_day::timestamp, bounds.last_day::timestamp, interval '1 day') AS series(day)
      LEFT JOIN counts ON counts.day = series.day::date
      ORDER BY series.day
    `,
    prisma.exam.groupBy({
      by: ["startTime"],
      where: {
        status: "published",
        startTime: { gte: calendarStart, lt: calendarEnd },
      },
      _count: true,
    }),
  ]);

  const totalUsers = userCounts.reduce((sum, group) => sum + group._count, 0);
  const totalExams = examCounts.reduce((sum, group) => sum + group._count, 0);
  const draftExams =
    examCounts.find(({ status }) => status === "draft")?._count ?? 0;
  const totalAttempts = attemptCounts.reduce(
    (sum, group) => sum + group._count,
    0,
  );
  const pendingAttempts =
    attemptCounts.find(({ status }) => status === "submitted")?._count ?? 0;
  const submissionTotal = dailySubmissions.reduce(
    (sum, { value }) => sum + value,
    0,
  );
  const startsByDay = new Map<string, number>();
  for (const { startTime, _count } of scheduledStarts) {
    if (!startTime) continue;
    const day = formatIsoUtc(startTime).slice(0, 10);
    startsByDay.set(day, (startsByDay.get(day) ?? 0) + _count);
  }

  return (
    <>
      <div className="dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<UsersIcon />}
          label="User accounts"
          value={totalUsers}
        />
        <StatCard
          icon={<FileTextIcon />}
          label="Exams"
          value={totalExams}
          detail={`${draftExams} in draft`}
        />
        <StatCard
          icon={<BookOpenIcon />}
          label="Bank questions"
          value={questionCount}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Attempts"
          value={totalAttempts}
          detail={`${pendingAttempts} awaiting marking`}
        />
      </div>

      <DashboardSection id="admin-submissions" title="Daily submissions">
        {submissionTotal > 0 ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              <strong className="font-semibold tabular-nums text-foreground">
                {submissionTotal.toLocaleString("en")}
              </strong>{" "}
              submissions in the last 14 days (UTC)
            </p>
            <DashboardTrend
              variant="daily-count"
              metric="Submissions"
              points={dailySubmissions.map(({ day, value }) => {
                const date = parseISO(day);
                return {
                  label: format(date, "MMM d"),
                  detail: formatDisplayDate(date),
                  value,
                };
              })}
            />
          </div>
        ) : (
          <DashboardEmpty>
            No attempts were submitted in the last 14 days (UTC).
          </DashboardEmpty>
        )}
      </DashboardSection>

      <DashboardSection id="admin-exam-starts" title="Exam start calendar">
        {startsByDay.size ? (
          <ExamStartsHeatmap
            firstDay={utcDay}
            lastDay={calendarLastDay}
            countsByDay={startsByDay}
          />
        ) : (
          <DashboardEmpty>
            No published exams start in this 28-day window (UTC).
          </DashboardEmpty>
        )}
      </DashboardSection>

      <div className="dashboard-section grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardSection
          id="admin-recent-exams"
          title="Recent exams"
          action={
            <DashboardLink href="/admin/exams" variant="outline">
              All exams
            </DashboardLink>
          }
        >
          {recentExams.length ? (
            <ul>
              {recentExams.map((exam) => (
                <DashboardRow key={exam.id}>
                  <div className="min-w-0 flex-1 basis-40">
                    <Link
                      href={`/admin/exams/${exam.id}`}
                      className="wrap-anywhere font-semibold underline-offset-4 hover:underline"
                    >
                      {exam.title}
                    </Link>
                    <p className="wrap-anywhere text-xs text-muted-foreground">
                      {exam.createdBy.name} &middot;{" "}
                      {formatDisplayDate(exam.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {exam.status}
                  </Badge>
                </DashboardRow>
              ))}
            </ul>
          ) : (
            <DashboardEmpty>No exams have been created yet.</DashboardEmpty>
          )}
        </DashboardSection>

        <DashboardSection id="admin-user-roles" title="Accounts by role">
          {userCounts.length ? (
            <StatusBreakdown
              items={userCounts
                .map(({ role, _count }) => ({
                  label:
                    role === "student"
                      ? "Candidate"
                      : role
                        ? role.charAt(0).toUpperCase() + role.slice(1)
                        : "Unassigned",
                  count: _count,
                }))
                .sort(
                  (a, b) => b.count - a.count || a.label.localeCompare(b.label),
                )}
            />
          ) : (
            <DashboardEmpty>No accounts to display.</DashboardEmpty>
          )}
        </DashboardSection>
      </div>

      <DashboardSection
        id="admin-recent-attempts"
        title="Recent attempts"
        action={
          <DashboardLink href="/admin/results" variant="outline">
            All results
          </DashboardLink>
        }
      >
        {recentAttempts.length ? (
          <ResponsiveTable aria-label="Recent attempts">
            <table className="w-full min-w-0 table-fixed text-left text-sm sm:table-auto [&_td]:px-3 [&_th]:px-3">
              <thead className="text-xs">
                <tr>
                  <th scope="col" className="w-[57%] py-2.5 sm:w-auto">
                    Candidate
                  </th>
                  <th scope="col" className="hidden py-2.5 sm:table-cell">
                    Exam
                  </th>
                  <th scope="col" className="py-2.5">
                    Status<span className="sm:hidden"> and score</span>
                  </th>
                  <th scope="col" className="hidden py-2.5 sm:table-cell">
                    Submitted
                  </th>
                  <th
                    scope="col"
                    className="hidden py-2.5 text-right sm:table-cell"
                  >
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentAttempts.map((attempt) => {
                  const score =
                    attempt.status !== "in_progress" &&
                    attempt.totalScore != null
                      ? `${formatScore(attempt.totalScore)}/${attempt.maxScore}`
                      : null;

                  return (
                    <tr key={attempt.id} className="align-top sm:align-middle">
                      <th
                        scope="row"
                        className="wrap-anywhere py-3 font-medium"
                      >
                        {attempt.status === "in_progress" ? (
                          attempt.user.name
                        ) : (
                          <Link
                            href={`/admin/results/${attempt.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {attempt.user.name}
                          </Link>
                        )}
                        <div className="mt-1 grid gap-0.5 text-xs font-normal text-muted-foreground sm:hidden">
                          <span>{attempt.exam.title}</span>
                          {attempt.submittedAt && (
                            <span>
                              {formatDisplayDate(attempt.submittedAt)}
                            </span>
                          )}
                        </div>
                      </th>
                      <td className="hidden wrap-anywhere py-3 sm:table-cell">
                        {attempt.exam.title}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={attempt.status} />
                        {score && (
                          <span className="mt-1 block text-xs tabular-nums sm:hidden">
                            {score}
                          </span>
                        )}
                      </td>
                      <td className="hidden py-3 whitespace-nowrap text-muted-foreground sm:table-cell">
                        {attempt.submittedAt
                          ? formatDisplayDate(attempt.submittedAt)
                          : "—"}
                      </td>
                      <td className="hidden py-3 text-right whitespace-nowrap tabular-nums sm:table-cell">
                        {score ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : (
          <DashboardEmpty>No candidate attempts yet.</DashboardEmpty>
        )}
      </DashboardSection>
    </>
  );
};

export default AdminDashboard;
