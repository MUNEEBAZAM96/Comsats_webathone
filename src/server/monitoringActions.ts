"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { differenceInMilliseconds } from "date-fns";
import prisma from "@/lib/database/dbClient";
import {
  getEffectiveAttemptDeadline,
  remainingMsUntil,
} from "@/lib/date/exam-time";
import { getEffectiveExamStatus } from "@/lib/exam/lifecycle";
import {
  announcementFormSchema,
  incidentFormSchema,
  incidentStatusSchema,
  type AnnouncementFormType,
  type IncidentFormType,
  type IncidentStatusFormType,
} from "@/lib/zodSchema";
import { ActionError, runAction } from "@/server/actionResult";
import { finalizeExpiredAttempts } from "@/server/attemptSweep";
import {
  AccessError,
  assertCanManageExam,
  assertCanMonitorExam,
  assertPermission,
  requireStaffSession,
  type StaffSession,
} from "@/server/examAccess";

/**
 * Heartbeats arrive every ~20s. Connection is derived from server time only:
 * a recent heartbeat from an online client is "online", short silence is
 * "idle", longer silence is "offline".
 */
const ONLINE_WINDOW_MS = 45_000;
const IDLE_WINDOW_MS = 120_000;
const TIMELINE_LIMIT = 300;

export type ConnectionState = "online" | "idle" | "offline" | "unknown";
export type CandidateStatus =
  | "not_started"
  | "in_progress"
  | "time_up"
  | "submitted"
  | "graded";

const monitorSession = async () => {
  const session = await requireStaffSession();
  await assertPermission(session, { exam: ["monitor"] });
  return session;
};

const revalidateMonitor = (examId: string) => {
  revalidatePath(`/admin/exams/${examId}/monitor`);
  revalidatePath(`/examiner/exams/${examId}/monitor`);
  revalidatePath(`/proctor/exams/${examId}`);
};

const parseDetail = (detail: string | null) => {
  if (!detail) return null;
  try {
    const value: unknown = JSON.parse(detail);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "clientAt") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
};

/**
 * Live view of one exam: every assigned candidate (plus anyone with an attempt),
 * their progress, liveness and automated signals. Signals are context for staff
 * judgement, never evidence on their own.
 */
export const getExamMonitor = async (examId: string) => {
  const session = await monitorSession();
  const exam = await assertCanMonitorExam(examId, session);
  await finalizeExpiredAttempts(exam.id);
  const now = new Date();

  const [assignments, attempts, questionCount, answered, events, incidents, announcementCount] =
    await Promise.all([
      prisma.examAssignment.findMany({
        where: { examId: exam.id },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.examAttempt.findMany({
        where: { examId: exam.id },
        select: {
          id: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          submitSource: true,
          lastSeenAt: true,
          lastSyncAt: true,
          clientOnline: true,
          pendingLocal: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.question.count({ where: { examId: exam.id } }),
      prisma.answer.groupBy({
        by: ["attemptId"],
        where: {
          attempt: { examId: exam.id },
          NOT: [{ text: null }, { text: "" }],
        },
        _count: { _all: true },
      }),
      prisma.attemptEvent.groupBy({
        by: ["attemptId", "type"],
        where: { examId: exam.id },
        _count: { _all: true },
      }),
      prisma.examIncident.groupBy({
        by: ["candidateId"],
        where: { examId: exam.id, status: { in: ["open", "under_review"] } },
        _count: { _all: true },
      }),
      prisma.examAnnouncement.count({
        where: { examId: exam.id, retractedAt: null },
      }),
    ]);

  const answeredByAttempt = new Map(answered.map((a) => [a.attemptId, a._count._all]));
  const eventsByAttempt = new Map<string, Record<string, number>>();
  for (const e of events) {
    const bucket = eventsByAttempt.get(e.attemptId) ?? {};
    bucket[e.type] = e._count._all;
    eventsByAttempt.set(e.attemptId, bucket);
  }
  const incidentsByCandidate = new Map(
    incidents.map((i) => [i.candidateId ?? "", i._count._all]),
  );
  const attemptByUser = new Map(attempts.map((a) => [a.user.id, a]));
  const assignedIds = new Set(assignments.map((a) => a.user.id));

  const candidates = [
    ...assignments.map((a) => a.user),
    ...attempts.filter((a) => !assignedIds.has(a.user.id)).map((a) => a.user),
  ];

  const rows = candidates
    .map((candidate) => {
      const attempt = attemptByUser.get(candidate.id);
      const deadline =
        attempt ?
          getEffectiveAttemptDeadline(attempt.startedAt, exam.duration, exam.endTime)
        : null;
      const remainingMs =
        attempt?.status === "in_progress" && deadline ?
          remainingMsUntil(deadline, now)
        : null;
      const status: CandidateStatus =
        !attempt ? "not_started"
        : attempt.status === "in_progress" ?
          remainingMs === 0 ?
            "time_up"
          : "in_progress"
        : attempt.status === "graded" ? "graded"
        : "submitted";
      let connection: ConnectionState = "unknown";
      if (attempt?.status === "in_progress") {
        const silentFor =
          attempt.lastSeenAt ? differenceInMilliseconds(now, attempt.lastSeenAt) : Infinity;
        connection =
          silentFor < ONLINE_WINDOW_MS && attempt.clientOnline ? "online"
          : silentFor < IDLE_WINDOW_MS ? "idle"
          : "offline";
      }
      return {
        candidate,
        assigned: assignedIds.has(candidate.id),
        attemptId: attempt?.id ?? null,
        status,
        startedAt: attempt?.startedAt ?? null,
        submittedAt: attempt?.submittedAt ?? null,
        submitSource: attempt?.submitSource ?? null,
        deadline,
        remainingMs,
        answered: attempt ? (answeredByAttempt.get(attempt.id) ?? 0) : 0,
        questionCount,
        lastSeenAt: attempt?.lastSeenAt ?? null,
        lastSyncAt: attempt?.lastSyncAt ?? null,
        clientOnline: attempt?.clientOnline ?? null,
        pendingLocal:
          attempt?.status === "in_progress" ? attempt.pendingLocal : 0,
        connection,
        events: attempt ? (eventsByAttempt.get(attempt.id) ?? {}) : {},
        openIncidents: incidentsByCandidate.get(candidate.id) ?? 0,
      };
    })
    .sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));

  return {
    serverNow: now,
    viewerRole: session.user.role,
    canManage:
      session.user.role === "admin" ||
      (session.user.role === "examiner" && exam.createdById === session.user.id),
    exam: {
      id: exam.id,
      title: exam.title,
      duration: exam.duration,
      startTime: exam.startTime,
      endTime: exam.endTime,
      effectiveStatus: getEffectiveExamStatus(exam, now),
      questionCount,
    },
    summary: {
      assigned: assignments.length,
      notStarted: rows.filter((r) => r.status === "not_started").length,
      inProgress: rows.filter(
        (r) => r.status === "in_progress" || r.status === "time_up",
      ).length,
      submitted: rows.filter((r) => r.status === "submitted").length,
      graded: rows.filter((r) => r.status === "graded").length,
      offlineNow: rows.filter((r) => r.connection === "offline").length,
      openIncidents: incidents.reduce((s, i) => s + i._count._all, 0),
      announcements: announcementCount,
    },
    rows,
  };
};

export type ExamMonitorData = Awaited<ReturnType<typeof getExamMonitor>>;
export type ExamMonitorRow = ExamMonitorData["rows"][number];

/** Polling wrapper for the client: never throws. */
export const refreshExamMonitor = async (examId: string) =>
  runAction(() => getExamMonitor(examId));

/** Server-timestamped signals and incidents for one attempt. No answer text. */
export const getAttemptTimeline = async (attemptId: string) =>
  runAction(async () => {
    const session = await monitorSession();
    if (typeof attemptId !== "string" || !attemptId || attemptId.length > 64)
      throw new ActionError("Attempt not found");
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        examId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        submitSource: true,
        lastSeenAt: true,
        lastSyncAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!attempt) throw new ActionError("Attempt not found");
    await assertCanMonitorExam(attempt.examId, session);

    const [events, incidents] = await Promise.all([
      prisma.attemptEvent.findMany({
        where: { attemptId },
        orderBy: { createdAt: "asc" },
        take: TIMELINE_LIMIT,
        select: { id: true, type: true, detail: true, createdAt: true },
      }),
      prisma.examIncident.findMany({
        where: { attemptId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          category: true,
          severity: true,
          status: true,
          description: true,
          createdAt: true,
          reportedBy: { select: { name: true } },
        },
      }),
    ]);

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        submitSource: attempt.submitSource,
        lastSeenAt: attempt.lastSeenAt,
        lastSyncAt: attempt.lastSyncAt,
        candidate: attempt.user,
      },
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        detail: parseDetail(e.detail),
        createdAt: e.createdAt,
      })),
      incidents,
    };
  });

export type AttemptTimeline = Extract<
  Awaited<ReturnType<typeof getAttemptTimeline>>,
  { ok: true }
>["data"];

const loadIncidents = (examId: string) =>
  prisma.examIncident.findMany({
    where: { examId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      attemptId: true,
      category: true,
      severity: true,
      status: true,
      description: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      candidate: { select: { id: true, name: true, email: true } },
      reportedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { name: true } },
    },
  });

export type IncidentListItem = Awaited<ReturnType<typeof loadIncidents>>[number];

export const listIncidents = async (examId: string) =>
  runAction(async () => {
    const session = await monitorSession();
    const exam = await assertCanMonitorExam(examId, session);
    return loadIncidents(exam.id);
  });

/** Record what a person observed. Linked to a candidate when one is given. */
export const createIncident = async (input: IncidentFormType) =>
  runAction(async () => {
    const session = await monitorSession();
    const parsed = incidentFormSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid incident");
    const data = parsed.data;
    const exam = await assertCanMonitorExam(data.examId, session);

    let attemptId: string | null = null;
    let candidateId: string | null = null;
    if (data.attemptId) {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: data.attemptId },
        select: { examId: true, userId: true },
      });
      if (!attempt || attempt.examId !== exam.id)
        throw new ActionError("That attempt does not belong to this exam");
      attemptId = data.attemptId;
      candidateId = attempt.userId;
    } else if (data.candidateId) {
      const [assignment, attempt] = await Promise.all([
        prisma.examAssignment.findUnique({
          where: { examId_userId: { examId: exam.id, userId: data.candidateId } },
          select: { id: true },
        }),
        prisma.examAttempt.findUnique({
          where: { userId_examId: { userId: data.candidateId, examId: exam.id } },
          select: { id: true },
        }),
      ]);
      if (!assignment && !attempt)
        throw new ActionError("That candidate is not assigned to this exam");
      candidateId = data.candidateId;
      attemptId = attempt?.id ?? null;
    }

    const incident = await prisma.examIncident.create({
      data: {
        examId: exam.id,
        attemptId,
        candidateId,
        reportedById: session.user.id,
        category: data.category,
        severity: data.severity,
        description: data.description,
      },
      select: { id: true },
    });
    revalidateMonitor(exam.id);
    return incident;
  });

/**
 * Anyone monitoring the exam may mark an incident under review; resolving or
 * dismissing it is a decision for the owning examiner or an admin.
 */
export const updateIncidentStatus = async (input: IncidentStatusFormType) =>
  runAction(async () => {
    const session = await monitorSession();
    const parsed = incidentStatusSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid update");
    const { incidentId, status, resolutionNote } = parsed.data;

    const incident = await prisma.examIncident.findUnique({
      where: { id: incidentId },
      select: { examId: true },
    });
    if (!incident) throw new ActionError("Incident not found");

    const closing = status === "resolved" || status === "dismissed";
    if (closing) await assertCanManageExam(incident.examId, session);
    else await assertCanMonitorExam(incident.examId, session);

    await prisma.examIncident.update({
      where: { id: incidentId },
      data: {
        status,
        resolutionNote: resolutionNote || null,
        resolvedById: closing ? session.user.id : null,
        resolvedAt: closing ? new Date() : null,
      },
    });
    revalidateMonitor(incident.examId);
    return null;
  });

const loadAnnouncements = (examId: string) =>
  prisma.examAnnouncement.findMany({
    where: { examId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      message: true,
      priority: true,
      createdAt: true,
      retractedAt: true,
      author: { select: { id: true, name: true } },
      _count: { select: { reads: true } },
    },
  });

export type AnnouncementListItem = Awaited<ReturnType<typeof loadAnnouncements>>[number];

export const listAnnouncements = async (examId: string) =>
  runAction(async () => {
    const session = await monitorSession();
    const exam = await assertCanMonitorExam(examId, session);
    const [announcements, assigned] = await Promise.all([
      loadAnnouncements(exam.id),
      prisma.examAssignment.count({ where: { examId: exam.id } }),
    ]);
    return { announcements, assigned };
  });

/** Broadcast to every candidate of the exam; delivered with the next heartbeat. */
export const createAnnouncement = async (input: AnnouncementFormType) =>
  runAction(async () => {
    const session = await monitorSession();
    const parsed = announcementFormSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid announcement");
    const exam = await assertCanMonitorExam(parsed.data.examId, session);
    const status = getEffectiveExamStatus(exam);
    if (status !== "published" && status !== "ongoing")
      throw new ActionError(
        "Announcements can only be sent while the exam is scheduled or running",
      );

    const announcement = await prisma.examAnnouncement.create({
      data: {
        examId: exam.id,
        authorId: session.user.id,
        message: parsed.data.message,
        priority: parsed.data.priority,
      },
      select: { id: true },
    });
    revalidateMonitor(exam.id);
    return announcement;
  });

const canRetract = async (
  session: StaffSession,
  announcement: { examId: string; authorId: string },
) => {
  if (announcement.authorId === session.user.id) {
    await assertCanMonitorExam(announcement.examId, session);
    return;
  }
  await assertCanManageExam(announcement.examId, session);
};

export const retractAnnouncement = async (announcementId: string) =>
  runAction(async () => {
    const session = await monitorSession();
    if (typeof announcementId !== "string" || !announcementId || announcementId.length > 64)
      throw new ActionError("Announcement not found");
    const announcement = await prisma.examAnnouncement.findUnique({
      where: { id: announcementId },
      select: { examId: true, authorId: true, retractedAt: true },
    });
    if (!announcement) throw new ActionError("Announcement not found");
    try {
      await canRetract(session, announcement);
    } catch (e) {
      if (e instanceof AccessError)
        throw new AccessError("Only the author, the exam owner or an admin can retract this");
      throw e;
    }
    if (!announcement.retractedAt)
      await prisma.examAnnouncement.update({
        where: { id: announcementId },
        data: { retractedAt: new Date() },
      });
    revalidateMonitor(announcement.examId);
    return null;
  });
