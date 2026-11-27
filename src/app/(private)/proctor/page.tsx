import type { Metadata } from "next";
import {
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  UsersIcon,
} from "lucide-react";
import { requireRole } from "@/server/session";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import { StatusBreakdown } from "@/components/Dashboard/StatusBreakdown";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
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

  const inProgressCount =
    examIds.length > 0 ?
      await prisma.examAttempt.count({
        where: { examId: { in: examIds }, status: "in_progress" },
      })
    : 0;

  const totalExams = proctorAssignments.length;
  const totalStudents = proctorAssignments.reduce(
    (sum, pa) => sum + pa.exam._count.assignments,
    0,
  );
  const totalAttempts = proctorAssignments.reduce(
    (sum, pa) => sum + pa.exam._count.attempts,
    0,
  );

  const examsWithActivity = proctorAssignments.filter(
    (pa) => pa.exam.status === "published" && pa.exam._count.attempts > 0,
  );

  return (
    <section className="grid gap-6">
      <DashboardIntro
        title="Proctor overview"
        action={
          <DashboardLink href="/proctor/exams">
            <EyeIcon aria-hidden="true" /> Assigned exams
          </DashboardLink>
        }>
        Monitor candidate activity and review your assigned exams.
      </DashboardIntro>

      <div className="dashboard-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={<FileTextIcon />}
          label="Assigned Exams"
          value={totalExams}
        />
        <StatCard
          icon={<UsersIcon />}
          label="Total Students"
          value={totalStudents}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Total Attempts"
          value={totalAttempts}
        />
        <StatCard
          icon={<EyeIcon />}
          label="Active Now"
          value={inProgressCount}
        />
      </div>

      <div className="dashboard-section grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          {examsWithActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Session activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {examsWithActivity.map((pa) => (
                    <div
                      key={pa.id}
                      className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">
                          {pa.exam.title || `Exam ${pa.examId}`}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {pa.exam._count.assignments} students &middot;{" "}
                          {pa.exam._count.attempts} attempt(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DashboardLink
                          href={`/proctor/exams/${pa.examId}` as Route}
                          variant="outline">
                          <EyeIcon aria-hidden="true" /> Monitor
                        </DashboardLink>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {totalExams === 0 && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                You haven&apos;t been assigned to any exams yet.
              </p>
            </Card>
          )}

          {totalExams > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your Assigned Exams</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {proctorAssignments.map((pa) => (
                    <div
                      key={pa.id}
                      className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                      <div>
                        <p className="font-medium">
                          {pa.exam.title || `Exam ${pa.examId}`}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {pa.exam._count.assignments} students &middot;{" "}
                          {pa.exam._count.attempts} attempt(s)
                        </p>
                      </div>
                      <DashboardLink
                        href={`/proctor/exams/${pa.examId}` as Route}
                        variant="outline">
                        <EyeIcon aria-hidden="true" /> Monitor
                      </DashboardLink>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Attempt status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <StatusBreakdown
              items={[
                { label: "In progress", count: inProgressCount, tone: "info" },
                {
                  label: "Other attempts",
                  count: Math.max(0, totalAttempts - inProgressCount),
                },
              ]}
            />
            <DashboardLink
              href="/proctor/results"
              variant="outline">
              View results
            </DashboardLink>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default ProctorDashboardPage;
