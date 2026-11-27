import type { Metadata, Route } from "next";
import {
  ActivityIcon,
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  UsersIcon,
} from "lucide-react";
import { requireRole } from "@/server/session";
import { DashboardIntro } from "@/components/Dashboard/DashboardIntro";
import { DashboardLink } from "@/components/Dashboard/DashboardLink";
import {
  DashboardEmpty,
  DashboardRow,
  DashboardSection,
} from "@/components/Dashboard/DashboardSection";
import { StatCard } from "@/components/Dashboard/StatCard";
import { IncidentSeverityBubbles } from "@/components/Dashboard/IncidentSeverityBubbles";
import { Badge } from "@/components/shadcnui/badge";
import prisma from "@/lib/database/dbClient";
import { formatDisplayDateTime } from "@/lib/date/format";
import { getEffectiveExamStatus } from "@/lib/exam/examStatus";
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

  const [assignments, unresolvedIncidents] = await Promise.all([
    prisma.examProctor.findMany({
      where: { proctorId: session.user.id },
      orderBy: [
        { exam: { startTime: { sort: "asc", nulls: "last" } } },
        { examId: "asc" },
      ],
      select: {
        exam: {
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
            _count: { select: { assignments: true, attempts: true } },
          },
        },
      },
    }),
    prisma.examIncident.groupBy({
      by: ["severity"],
      where: {
        exam: { proctors: { some: { proctorId: session.user.id } } },
        status: { in: ["open", "under_review"] },
      },
      _count: true,
    }),
  ]);

  const incidentsBySeverity = new Map<string, number>();
  for (const { severity, _count } of unresolvedIncidents) {
    const key = ["high", "medium", "low"].includes(severity)
      ? severity
      : "other";
    incidentsBySeverity.set(key, (incidentsBySeverity.get(key) ?? 0) + _count);
  }

  const now = new Date();
  const exams = assignments.map(({ exam }) => ({
    ...exam,
    effectiveStatus: getEffectiveExamStatus(exam, now),
  }));
  const liveExams = exams.filter(
    ({ effectiveStatus }) => effectiveStatus === "ongoing",
  );
  const upcoming = exams.filter(
    ({ effectiveStatus }) => effectiveStatus === "published",
  );
  const otherExams = exams
    .filter(
      ({ effectiveStatus }) =>
        effectiveStatus === "draft" || effectiveStatus === "completed",
    )
    .reverse();
  const liveAttemptCounts = liveExams.length
    ? await prisma.examAttempt.groupBy({
        by: ["examId", "status"],
        where: {
          examId: { in: liveExams.map(({ id }) => id) },
          status: { in: ["in_progress", "submitted", "graded"] },
        },
        _count: true,
      })
    : [];
  const attemptsByExam = new Map<
    string,
    { active: number; finished: number }
  >();

  for (const { examId, status, _count } of liveAttemptCounts) {
    const counts = attemptsByExam.get(examId) ?? { active: 0, finished: 0 };
    if (status === "in_progress") counts.active += _count;
    else counts.finished += _count;
    attemptsByExam.set(examId, counts);
  }
  const highestAttemptCount = liveExams.reduce((max, { id }) => {
    const counts = attemptsByExam.get(id);
    return counts ? Math.max(max, counts.active + counts.finished) : max;
  }, 0);

  const totalCandidates = exams.reduce(
    (sum, exam) => sum + exam._count.assignments,
    0,
  );
  const totalAttempts = exams.reduce(
    (sum, exam) => sum + exam._count.attempts,
    0,
  );
  const activeAttempts = [...attemptsByExam.values()].reduce(
    (sum, counts) => sum + counts.active,
    0,
  );

  return (
    <section className="grid gap-5">
      <DashboardIntro
        title="Proctor overview"
        action={
          <>
            <DashboardLink href="/proctor/exams">
              <EyeIcon aria-hidden="true" /> Assigned exams
            </DashboardLink>
            <DashboardLink href="/proctor/results" variant="outline">
              Results
            </DashboardLink>
          </>
        }
      >
        Open a live monitor or check the schedule for your assigned exams.
      </DashboardIntro>

      <div className="dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<ActivityIcon />}
          label="Live exams"
          value={liveExams.length}
          detail={`${activeAttempts} attempts in progress`}
        />
        <StatCard
          icon={<FileTextIcon />}
          label="Assigned exams"
          value={exams.length}
        />
        <StatCard
          icon={<UsersIcon />}
          label="Candidate assignments"
          value={totalCandidates}
        />
        <StatCard
          icon={<GraduationCapIcon />}
          label="Attempts"
          value={totalAttempts}
        />
      </div>

      <div className="dashboard-section grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardSection id="proctor-live" title="Live sessions">
          {liveExams.length ? (
            <>
              {highestAttemptCount > 0 && (
                <p className="mb-3 text-xs text-muted-foreground">
                  All bars use a scale of 0 to {highestAttemptCount} attempts.
                </p>
              )}
              <ul>
                {liveExams.map((exam) => {
                  const { active, finished } = attemptsByExam.get(exam.id) ?? {
                    active: 0,
                    finished: 0,
                  };

                  return (
                    <DashboardRow key={exam.id}>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="wrap-anywhere font-semibold">
                          {exam.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exam._count.assignments} assigned
                        </p>
                        {exam.endTime && (
                          <p className="text-xs text-muted-foreground">
                            Closes {formatDisplayDateTime(exam.endTime)}
                          </p>
                        )}
                      </div>
                      <DashboardLink
                        href={`/proctor/exams/${exam.id}` as Route}
                        variant="outline"
                      >
                        <EyeIcon aria-hidden="true" /> Monitor
                      </DashboardLink>
                      <div className="grid basis-full gap-2 pb-1">
                        {highestAttemptCount > 0 && (
                          <div
                            aria-hidden="true"
                            className="flex h-2.5 overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="bg-info"
                              style={{
                                width: `${(active / highestAttemptCount) * 100}%`,
                              }}
                            />
                            <span
                              className="bg-success"
                              style={{
                                width: `${(finished / highestAttemptCount) * 100}%`,
                              }}
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-full bg-info"
                            />
                            {active} in progress
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-full bg-success"
                            />
                            {finished} submitted or graded
                          </span>
                        </div>
                      </div>
                    </DashboardRow>
                  );
                })}
              </ul>
            </>
          ) : (
            <DashboardEmpty>
              No assigned exams are open right now.
            </DashboardEmpty>
          )}
        </DashboardSection>

        <DashboardSection id="proctor-upcoming" title="Upcoming sessions">
          {upcoming.length ? (
            <ul>
              {upcoming.slice(0, 4).map((exam) => (
                <DashboardRow key={exam.id}>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="wrap-anywhere font-semibold">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {exam.startTime && formatDisplayDateTime(exam.startTime)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {exam._count.assignments} assigned
                  </Badge>
                </DashboardRow>
              ))}
            </ul>
          ) : (
            <DashboardEmpty>No upcoming sessions are scheduled.</DashboardEmpty>
          )}
        </DashboardSection>
      </div>

      <DashboardSection
        id="proctor-incidents"
        title="Unresolved incident severity"
      >
        {incidentsBySeverity.size ? (
          <IncidentSeverityBubbles counts={incidentsBySeverity} />
        ) : (
          <DashboardEmpty>
            No open or under-review incidents on your assigned exams.
          </DashboardEmpty>
        )}
      </DashboardSection>

      {otherExams.length > 0 && (
        <DashboardSection id="proctor-other" title="Draft and completed exams">
          <ul>
            {otherExams.slice(0, 5).map((exam) => (
              <DashboardRow key={exam.id}>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="wrap-anywhere font-semibold">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam._count.assignments} assigned &middot;{" "}
                    {exam._count.attempts} attempts
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {exam.effectiveStatus}
                </Badge>
                <DashboardLink
                  href={`/proctor/exams/${exam.id}` as Route}
                  variant="outline"
                >
                  Review session
                </DashboardLink>
              </DashboardRow>
            ))}
          </ul>
        </DashboardSection>
      )}
    </section>
  );
};

export default ProctorDashboardPage;
