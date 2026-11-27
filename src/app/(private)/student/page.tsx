import type { Metadata } from "next";
import { format, isAfter } from "date-fns";
import { requireRole } from "@/server/session";
import prisma from "@/lib/database/dbClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { Button } from "@/components/shadcnui/button";
import { Badge } from "@/components/shadcnui/badge";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import { StatCard } from "@/components/Dashboard/StatCard";
import {
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  PlayIcon,
  RotateCcwIcon,
  TargetIcon,
} from "lucide-react";
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

  const [assignments, attempts, recentAttempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { userId },
      include: {
        exam: {
          select: {
            id: true,
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
        id: true,
        examId: true,
        exam: { select: { title: true } },
        status: true,
        autoScore: true,
        maxScore: true,
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId, status: { in: ["submitted", "graded"] } },
      take: 5,
      orderBy: { submittedAt: { sort: "desc", nulls: "last" } },
      include: {
        exam: { select: { title: true } },
      },
    }),
  ]);

  const now = new Date();
  const completedAttempts = attempts.filter(
    (a) => a.status === "submitted" || a.status === "graded",
  );
  const inProgressAttempts = attempts.filter((a) => a.status === "in_progress");
  const attemptExamIds = new Set(attempts.map((a) => a.examId));
  const pendingExams = assignments.filter(
    (a) =>
      a.exam.status === "published" &&
      !attemptExamIds.has(a.examId) &&
      (!a.exam.startTime || !isAfter(a.exam.startTime, now)) &&
      (!a.exam.endTime || isAfter(a.exam.endTime, now)),
  );
  const upcomingExams = assignments.filter(
    (a) =>
      a.exam.status === "published" &&
      !attemptExamIds.has(a.examId) &&
      a.exam.startTime &&
      isAfter(a.exam.startTime, now),
  );

  const avgScore =
    completedAttempts.length > 0 ?
      Math.round(
        completedAttempts.reduce((sum, a) => sum + (a.autoScore ?? 0), 0) /
          completedAttempts.length,
      )
    : null;

  const maxAvgScore =
    completedAttempts.length > 0 ?
      Math.round(
        completedAttempts.reduce((sum, a) => sum + (a.maxScore ?? 1), 0) /
          completedAttempts.length,
      )
    : null;

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
          label="Pending Exams"
          value={pendingExams.length}
        />
        <StatCard
          icon={<RotateCcwIcon />}
          label="In Progress"
          value={inProgressAttempts.length}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Completed"
          value={completedAttempts.length}
        />
        <StatCard
          icon={<TargetIcon />}
          label="Avg Score"
          value={avgScore !== null ? `${avgScore}/${maxAvgScore}` : "—"}
        />
      </div>

      <div className="dashboard-section grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          {pendingExams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ready to Start</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {pendingExams.map((a) => (
                    <div
                      key={a.examId}
                      className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">{a.exam.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {a.exam.duration} min
                          {a.exam.endTime &&
                            ` · ends ${format(a.exam.endTime, "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <DashboardLink
                        prefetch={false}
                        href={`/student/exams/${a.exam.id}` as Route}>
                        <PlayIcon aria-hidden="true" /> Start
                      </DashboardLink>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {upcomingExams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Exams</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {upcomingExams.map((a) => (
                    <div
                      key={a.examId}
                      className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">{a.exam.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {a.exam.duration} min
                          {a.exam.startTime &&
                            ` · starts ${format(a.exam.startTime, "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <Button
                        size="lg"
                        disabled>
                        <ClockIcon className="size-4" /> Scheduled
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {inProgressAttempts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Continue Exams</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {inProgressAttempts.slice(0, 5).map((a) => (
                    <div
                      key={a.id}
                      className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">{a.exam.title}</p>
                      </div>
                      <DashboardLink
                        prefetch={false}
                        href={`/student/exams/${a.examId}` as Route}>
                        <RotateCcwIcon aria-hidden="true" /> Resume
                      </DashboardLink>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recentAttempts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {recentAttempts.map((a) => (
                    <div
                      key={a.id}
                      className="border-border flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{a.exam.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {a.submittedAt ?
                            format(a.submittedAt, "MMM d, yyyy")
                          : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.autoScore !== null && (
                          <span className="text-xs font-medium">
                            {a.autoScore}/{a.maxScore}
                          </span>
                        )}
                        <Badge
                          variant={
                            a.status === "graded" ? "default" : "outline"
                          }>
                          {a.status === "graded" ? "Graded" : "Submitted"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pendingExams.length +
            upcomingExams.length +
            inProgressAttempts.length +
            recentAttempts.length ===
            0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your exam schedule</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-muted-foreground">
                  {assignments.length ?
                    "There are no exams scheduled right now."
                  : "Your assigned exams will appear here. Contact your examiner if you’re expecting an assignment."
                  }
                </p>
                <DashboardLink
                  href="/student/exams"
                  variant="outline">
                  View all exams
                </DashboardLink>
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Assessment progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdown
              items={[
                {
                  label: "Upcoming",
                  count: upcomingExams.length,
                  tone: "info",
                },
                { label: "Ready to start", count: pendingExams.length },
                {
                  label: "In progress",
                  count: inProgressAttempts.length,
                  tone: "warning",
                },
                {
                  label: "Completed",
                  count: completedAttempts.length,
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
