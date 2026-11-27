"use server";

import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { differenceInMilliseconds, isAfter } from "date-fns";
import { Prisma } from "@generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import {
  getEffectiveAttemptDeadline,
  remainingMsUntil,
} from "@/lib/date/exam-time";
import {
  getCandidateExamEligibility,
  getStartBlockReason,
  isFinishedAttemptStatus,
} from "@/lib/exam/eligibility";
import { isManualQuestion } from "@/lib/exam/grading";
import {
  getEffectiveExamStatus,
  syncExamLifecycle,
  withExamApiFields,
} from "@/lib/exam/lifecycle";
import {
  attemptIdSchema,
  heartbeatSchema,
  MAX_EVENTS_PER_ATTEMPT,
  recordEventsSchema,
  saveAnswersSchema,
  submitOptionsSchema,
  type AttemptEventInput,
  type HeartbeatResult,
  type SaveAnswerItem,
  type SaveAnswerItemResult,
  type SaveAnswersResult,
  type StudentAnnouncement,
  type SubmitOptions,
} from "@/lib/exam/syncSchemas";
import {
  AttemptNotInProgressError,
  buildSnapshotRows,
  ensureAttemptSnapshots,
  finalizeAttemptIdempotent,
  lockAttempt,
} from "@/server/attemptGrading";

/** Heartbeats closer together than this only write when state changed. */
const HEARTBEAT_WRITE_INTERVAL_MS = 15_000;

const getStudentSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "student") redirect("/");
  return session;
};

/** For background calls (sync, heartbeat): report instead of redirecting. */
const getStudentSessionSafe = async () => {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  return session && session.user.role === "student" ? session : null;
};

const SESSION_ENDED = "Your session has ended. Sign in again to continue.";

const isResultVisible = (exam: {
  resultsPublishedAt: Date | null;
  resultReveal: string;
}) => Boolean(exam.resultsPublishedAt) && exam.resultReveal !== "none";

/**
 * Assigned exams for the signed-in candidate with server-computed eligibility.
 * Draft exams are omitted. Scores are only included once results are published.
 */
export const getStudentExams = async () => {
  const session = await getStudentSession();

  try {
    const assignments = await prisma.examAssignment.findMany({
      where: { userId: session.user.id },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            description: true,
            instructions: true,
            status: true,
            duration: true,
            startTime: true,
            endTime: true,
            totalMarks: true,
            resultsPublishedAt: true,
            resultReveal: true,
            _count: { select: { questions: true } },
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    const examIds = assignments.map((a) => a.examId);

    const attempts = await prisma.examAttempt.findMany({
      where: { userId: session.user.id, examId: { in: examIds } },
      select: {
        examId: true,
        status: true,
        id: true,
        startedAt: true,
        submittedAt: true,
        totalScore: true,
        maxScore: true,
      },
    });

    const attemptMap = new Map(attempts.map((a) => [a.examId, a]));
    const now = new Date();

    const exams = await Promise.all(
      assignments.map(async ({ exam }) => {
        const synced = await syncExamLifecycle(exam, now);
        const raw = attemptMap.get(exam.id) ?? null;
        const resultsVisible = isResultVisible(exam);
        const attempt =
          raw ?
            { ...raw, totalScore: resultsVisible ? raw.totalScore : null }
          : null;
        const eligibility = getCandidateExamEligibility(
          {
            status: synced.status,
            startTime: synced.startTime,
            endTime: synced.endTime,
            duration: synced.duration,
            questionCount: synced._count.questions,
          },
          attempt,
          now,
        );
        return {
          ...withExamApiFields(synced, now),
          attempt,
          resultsVisible,
          eligibility,
        };
      }),
    );

    return {
      serverNow: now,
      exams: exams.filter((e) => e.eligibility.bucket !== "hidden"),
    };
  } catch {
    throw new Error("Failed to fetch exams");
  }
};

export type StudentExamListItem = Awaited<
  ReturnType<typeof getStudentExams>
>["exams"][number];

/**
 * Start a new attempt or resume an existing one. Eligibility is decided only
 * from the server clock and stored exam/attempt state.
 */
export const startExam = async (examId: string) => {
  const session = await getStudentSession();

  try {
    const assignment = await prisma.examAssignment.findUnique({
      where: { examId_userId: { examId, userId: session.user.id } },
      include: {
        exam: { include: { _count: { select: { questions: true } } } },
      },
    });

    if (!assignment) throw new Error("You are not assigned to this exam");

    const now = new Date();
    const exam = await syncExamLifecycle(assignment.exam, now);
    const effective = getEffectiveExamStatus(exam, now);

    // Resume / finalize existing attempts even after the exam auto-completes.
    const existing = await prisma.examAttempt.findUnique({
      where: { userId_examId: { userId: session.user.id, examId } },
    });

    if (existing) {
      if (existing.status === "in_progress") {
        const effectiveDeadline = getEffectiveAttemptDeadline(
          existing.startedAt,
          exam.duration,
          exam.endTime,
        );

        if (effective === "completed" || isAfter(now, effectiveDeadline)) {
          await ensureAttemptSnapshots(existing.id, exam);
          await finalizeAttemptIdempotent(existing.id, "resume_finalize");
          return prisma.examAttempt.findUnique({ where: { id: existing.id } });
        }

        // Recover missing snapshots so resume does not fail later.
        await ensureAttemptSnapshots(existing.id, exam);
      }
      return existing;
    }

    const blocked = getStartBlockReason(
      {
        status: exam.status,
        startTime: exam.startTime,
        endTime: exam.endTime,
        duration: exam.duration,
        questionCount: exam._count.questions,
      },
      now,
    );
    if (blocked) throw new Error(blocked);

    const attempt = await prisma.$transaction(async (tx) => {
      const questions = await tx.question.findMany({
        where: { examId },
        orderBy: { order: "asc" },
        include: {
          section: { select: { title: true, instructions: true } },
        },
      });
      if (questions.length === 0)
        throw new Error("This exam has no questions yet. Contact your examiner.");
      const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

      const created = await tx.examAttempt.create({
        data: {
          userId: session.user.id,
          examId,
          maxScore,
          lastSeenAt: now,
        },
      });

      await tx.attemptQuestion.createMany({
        data: buildSnapshotRows(created.id, questions, exam),
      });

      return created;
    });

    return attempt;
  } catch (e) {
    // Two tabs racing to start: the unique (userId, examId) attempt wins once.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const winner = await prisma.examAttempt.findUnique({
        where: { userId_examId: { userId: session.user.id, examId } },
      });
      if (winner) return winner;
    }
    if (e instanceof Error) throw e;
    throw new Error("Failed to start exam");
  }
};

const loadAttemptForStudent = (attemptId: string) =>
  prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      examId: true,
      status: true,
      startedAt: true,
      lastSeenAt: true,
      clientOnline: true,
      pendingLocal: true,
      exam: {
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          duration: true,
          totalMarks: true,
          shuffleQuestions: true,
          shuffleOptions: true,
        },
      },
    },
  });

const deadlineFor = (attempt: {
  startedAt: Date;
  exam: { duration: number; endTime: Date | null };
}) =>
  getEffectiveAttemptDeadline(
    attempt.startedAt,
    attempt.exam.duration,
    attempt.exam.endTime,
  );

/**
 * Authoritative remaining time for an attempt, computed from the server clock.
 * The exam player uses this to correct client timer drift; it never extends time.
 */
export const getAttemptClock = async (attemptId: string) => {
  const session = await getStudentSession();
  const attempt = await loadAttemptForStudent(attemptId);
  if (!attempt || attempt.userId !== session.user.id)
    throw new Error("Unauthorized");

  const now = new Date();
  const deadline = deadlineFor(attempt);
  return {
    status: attempt.status,
    remainingMs:
      attempt.status === "in_progress" ? remainingMsUntil(deadline, now) : 0,
    deadline: deadline.toISOString(),
    serverNow: now.toISOString(),
  };
};

export const getAttemptQuestions = async (attemptId: string) => {
  const session = await getStudentSession();

  let attempt;
  try {
    attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        examId: true,
        status: true,
        startedAt: true,
        exam: {
          select: {
            title: true,
            duration: true,
            endTime: true,
            instructions: true,
          },
        },
      },
    });
  } catch {
    throw new Error("Failed to load exam questions");
  }

  if (!attempt || attempt.userId !== session.user.id)
    redirect("/student/exams");

  const now = new Date();
  const deadline = deadlineFor(attempt);
  const clock = {
    deadline: deadline.toISOString(),
    remainingMs:
      attempt.status === "in_progress" ? remainingMsUntil(deadline, now) : 0,
  };

  if (attempt.status !== "in_progress")
    return {
      attempt,
      clock,
      questions: [] as never[],
      answers: [] as never[],
      announcements: [] as StudentAnnouncement[],
    };

  let snapshots = await prisma.attemptQuestion.findMany({
    where: { attemptId },
    orderBy: { order: "asc" },
  });

  if (snapshots.length === 0) {
    const examRow = await prisma.exam.findUnique({ where: { id: attempt.examId } });
    if (examRow) await ensureAttemptSnapshots(attemptId, examRow);
    snapshots = await prisma.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { order: "asc" },
    });
  }

  if (snapshots.length === 0) {
    throw new Error("Exam question snapshots are missing for this attempt");
  }

  // Strip answer keys / marking schemes. id = sourceQuestionId for Answer FK + UI compat.
  const questions = snapshots.map((s) => ({
    id: s.sourceQuestionId,
    attemptQuestionId: s.id,
    examId: attempt.examId,
    text: s.text,
    type: s.type,
    options: s.optionOrder ?? s.options,
    points: s.points,
    order: s.order,
    difficulty: s.difficulty,
  }));

  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: { questionId: true, text: true, clientSeq: true },
  });

  const announcements = await loadStudentAnnouncements(
    attempt.examId,
    session.user.id,
  );

  return { attempt, clock, questions, answers, announcements };
};

/**
 * Apply versioned answer writes. Each (attempt, question) keeps the highest
 * `clientSeq` it has seen, so a delayed retry can never overwrite a newer edit.
 * Holds the attempt row lock, which submission also takes.
 */
const applyAnswerItems = async (
  userId: string,
  attemptId: string,
  items: SaveAnswerItem[],
): Promise<SaveAnswersResult> => {
  const attempt = await loadAttemptForStudent(attemptId);
  if (!attempt || attempt.userId !== userId)
    return { ok: false, reason: "unauthorized", message: "Unauthorized" };
  if (attempt.status !== "in_progress")
    return {
      ok: false,
      reason: "already_submitted",
      message: "This exam has already been submitted.",
    };

  const exam = await syncExamLifecycle(attempt.exam, new Date());
  const deadline = deadlineFor(attempt);
  const closed = () =>
    exam.status === "completed" ||
    exam.status === "draft" ||
    isAfter(new Date(), deadline);
  if (closed())
    return {
      ok: false,
      reason: "deadline_passed",
      message: "The exam time has expired. Late answers are not accepted.",
    };

  // Keep only the newest write per question from this batch.
  const latest = new Map<string, SaveAnswerItem>();
  for (const item of items) {
    const prev = latest.get(item.questionId);
    if (!prev || item.clientSeq > prev.clientSeq) latest.set(item.questionId, item);
  }

  const snapshots = await prisma.attemptQuestion.findMany({
    where: { attemptId, sourceQuestionId: { in: [...latest.keys()] } },
    select: { id: true, sourceQuestionId: true },
  });
  const snapshotByQuestion = new Map(
    snapshots.map((s) => [s.sourceQuestionId, s.id]),
  );

  try {
    const results = await prisma.$transaction(
      async (tx) => {
        const status = await lockAttempt(tx, attemptId);
        if (status !== "in_progress") throw new AttemptNotInProgressError();
        if (closed()) throw new DeadlinePassedError();
        // Staff may have completed the exam since `exam` was loaded.
        const current = await tx.exam.findUnique({
          where: { id: exam.id },
          select: { status: true },
        });
        if (current?.status !== "published") throw new DeadlinePassedError();

        // Every writer of answer text holds the attempt row lock, so one read
        // here is consistent for the rest of the transaction.
        const existingRows = await tx.answer.findMany({
          where: { attemptId, questionId: { in: [...latest.keys()] } },
          select: { questionId: true, clientSeq: true, idempotencyKey: true, text: true },
        });
        const existingByQuestion = new Map(existingRows.map((r) => [r.questionId, r]));

        const out: SaveAnswerItemResult[] = [];
        const toCreate: {
          attemptId: string;
          questionId: string;
          attemptQuestionId: string;
          text: string;
          clientSeq: number;
          idempotencyKey: string;
        }[] = [];

        for (const item of latest.values()) {
          const snapshotId = snapshotByQuestion.get(item.questionId);
          if (!snapshotId) {
            out.push({ questionId: item.questionId, status: "invalid", serverSeq: 0 });
            continue;
          }
          const existing = existingByQuestion.get(item.questionId);

          if (!existing) {
            toCreate.push({
              attemptId,
              questionId: item.questionId,
              attemptQuestionId: snapshotId,
              text: item.text,
              clientSeq: item.clientSeq,
              idempotencyKey: item.idempotencyKey,
            });
            out.push({ questionId: item.questionId, status: "saved", serverSeq: item.clientSeq });
            continue;
          }

          if (
            existing.clientSeq === item.clientSeq &&
            existing.idempotencyKey === item.idempotencyKey
          ) {
            out.push({ questionId: item.questionId, status: "duplicate", serverSeq: existing.clientSeq });
            continue;
          }

          if (existing.clientSeq >= item.clientSeq) {
            out.push({
              questionId: item.questionId,
              status: "stale",
              serverSeq: existing.clientSeq,
              serverText: existing.text ?? "",
            });
            continue;
          }

          await tx.answer.update({
            where: { attemptId_questionId: { attemptId, questionId: item.questionId } },
            data: {
              text: item.text,
              clientSeq: item.clientSeq,
              idempotencyKey: item.idempotencyKey,
              attemptQuestionId: snapshotId,
            },
          });
          out.push({ questionId: item.questionId, status: "saved", serverSeq: item.clientSeq });
        }

        if (toCreate.length) await tx.answer.createMany({ data: toCreate });

        const now = new Date();
        await tx.examAttempt.update({
          where: { id: attemptId },
          data: { lastSyncAt: now, lastSeenAt: now, clientOnline: true },
        });
        return out;
      },
      { timeout: 15_000 },
    );
    return { ok: true, serverTime: new Date().toISOString(), results };
  } catch (e) {
    if (e instanceof AttemptNotInProgressError)
      return {
        ok: false,
        reason: "already_submitted",
        message: "This exam has already been submitted.",
      };
    if (e instanceof DeadlinePassedError)
      return {
        ok: false,
        reason: "deadline_passed",
        message: "The exam time has expired. Late answers are not accepted.",
      };
    throw e;
  }
};

class DeadlinePassedError extends Error {}

/**
 * Batch answer sync for the offline queue. Expected conditions are returned,
 * not thrown, so the client can tell "retry later" from "stop".
 */
export const saveAnswers = async (
  attemptId: string,
  items: SaveAnswerItem[],
): Promise<SaveAnswersResult> => {
  const session = await getStudentSessionSafe();
  if (!session) return { ok: false, reason: "unauthorized", message: SESSION_ENDED };

  const parsed = saveAnswersSchema.safeParse({ attemptId, items });
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Invalid answer data",
    };

  return applyAnswerItems(session.user.id, parsed.data.attemptId, parsed.data.items);
};

const loadStudentAnnouncements = async (
  examId: string,
  userId: string,
): Promise<StudentAnnouncement[]> => {
  const rows = await prisma.examAnnouncement.findMany({
    where: { examId, retractedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      message: true,
      priority: true,
      createdAt: true,
      reads: { where: { userId }, select: { userId: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    priority:
      r.priority === "urgent" || r.priority === "important" ? r.priority : "info",
    createdAt: r.createdAt.toISOString(),
    read: r.reads.length > 0,
  }));
};

/**
 * Liveness + clock + announcements in one round trip. Expired in-progress
 * attempts are finalized here, so the server never waits on the client clock.
 */
export const heartbeat = async (input: {
  attemptId: string;
  online: boolean;
  pendingLocal: number;
  visible: boolean;
}): Promise<HeartbeatResult> => {
  const session = await getStudentSessionSafe();
  if (!session) return { ok: false, reason: "unauthorized", message: SESSION_ENDED };

  const parsed = heartbeatSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid", message: "Invalid heartbeat" };
  const { attemptId, online, pendingLocal } = parsed.data;

  const attempt = await loadAttemptForStudent(attemptId);
  if (!attempt || attempt.userId !== session.user.id)
    return { ok: false, reason: "unauthorized", message: "Unauthorized" };

  const now = new Date();
  const deadline = deadlineFor(attempt);
  let status = attempt.status;

  if (status === "in_progress") {
    if (isAfter(now, deadline)) {
      await ensureAttemptSnapshots(attempt.id, attempt.exam);
      status = (await finalizeAttemptIdempotent(attempt.id, "timer")).status;
    } else {
      const due =
        !attempt.lastSeenAt ||
        differenceInMilliseconds(now, attempt.lastSeenAt) >=
          HEARTBEAT_WRITE_INTERVAL_MS;
      if (
        due ||
        attempt.clientOnline !== online ||
        attempt.pendingLocal !== pendingLocal
      ) {
        await prisma.examAttempt.update({
          where: { id: attempt.id },
          data: { lastSeenAt: now, clientOnline: online, pendingLocal },
        });
      }
    }
  }

  return {
    ok: true,
    status,
    remainingMs: status === "in_progress" ? remainingMsUntil(deadline, now) : 0,
    deadline: deadline.toISOString(),
    serverNow: now.toISOString(),
    announcements: await loadStudentAnnouncements(attempt.examId, session.user.id),
  };
};

const serializeEventDetail = (event: AttemptEventInput) => {
  const detail = {
    ...(event.detail ?? {}),
    ...(event.clientAt ? { clientAt: event.clientAt } : {}),
  };
  if (Object.keys(detail).length === 0) return null;
  const json = JSON.stringify(detail);
  return json.length <= 500 ? json : null;
};

/**
 * Store workspace signals (tab hidden, connection lost, …) with the server
 * clock. Capped per attempt; ignored once the attempt is finished.
 */
export const recordAttemptEvents = async (
  attemptId: string,
  events: AttemptEventInput[],
) => {
  const session = await getStudentSessionSafe();
  if (!session) return { ok: false as const, stored: 0 };

  const parsed = recordEventsSchema.safeParse({ attemptId, events });
  if (!parsed.success) return { ok: false as const, stored: 0 };

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { userId: true, status: true, examId: true },
  });
  if (!attempt || attempt.userId !== session.user.id)
    return { ok: false as const, stored: 0 };
  if (attempt.status !== "in_progress") return { ok: true as const, stored: 0 };

  const existing = await prisma.attemptEvent.count({
    where: { attemptId: parsed.data.attemptId },
  });
  const room = Math.max(0, MAX_EVENTS_PER_ATTEMPT - existing);
  const rows = parsed.data.events
    .slice(0, room)
    .map((e) => ({
      attemptId: parsed.data.attemptId,
      examId: attempt.examId,
      type: e.type,
      detail: serializeEventDetail(e),
    }));
  if (rows.length > 0) await prisma.attemptEvent.createMany({ data: rows });
  return { ok: true as const, stored: rows.length };
};

export const getAttemptAnnouncements = async (attemptId: string) => {
  const session = await getStudentSession();
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, examId: true },
  });
  if (!attempt || attempt.userId !== session.user.id)
    throw new Error("Unauthorized");
  return loadStudentAnnouncements(attempt.examId, session.user.id);
};

export const markAnnouncementRead = async (announcementId: string) => {
  const session = await getStudentSessionSafe();
  if (!session || typeof announcementId !== "string" || announcementId.length > 64)
    return { ok: false };

  const announcement = await prisma.examAnnouncement.findUnique({
    where: { id: announcementId },
    select: { examId: true, retractedAt: true },
  });
  if (!announcement || announcement.retractedAt) return { ok: false };

  const assigned = await prisma.examAssignment.findUnique({
    where: {
      examId_userId: { examId: announcement.examId, userId: session.user.id },
    },
    select: { id: true },
  });
  if (!assigned) return { ok: false };

  await prisma.announcementRead.createMany({
    data: [{ announcementId, userId: session.user.id }],
    skipDuplicates: true,
  });
  return { ok: true };
};

/**
 * Finalize and auto-grade an attempt. Idempotent: submitting an attempt that is
 * already finished succeeds without re-grading. `finalItems` go through the same
 * deadline-checked path as autosave first, so submission never accepts late work.
 */
export const submitExam = async (rawAttemptId: string, options?: SubmitOptions) => {
  const session = await getStudentSession();
  const attemptId = attemptIdSchema.parse(rawAttemptId);
  const opts = submitOptionsSchema.parse(options ?? {});

  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: true },
    });

    if (!attempt || attempt.userId !== session.user.id)
      throw new Error("Unauthorized");
    if (isFinishedAttemptStatus(attempt.status))
      return { status: attempt.status, alreadySubmitted: true };

    await syncExamLifecycle(attempt.exam);

    if (opts.finalItems && opts.finalItems.length > 0) {
      // Rejected silently once the deadline has passed.
      await applyAnswerItems(session.user.id, attemptId, opts.finalItems);
    }

    await ensureAttemptSnapshots(attemptId, attempt.exam);
    const result = await finalizeAttemptIdempotent(attemptId, opts.source);

    updateTag("admin-dashboard");
    updateTag("examiner-dashboard");
    revalidatePath("/student");
    revalidatePath("/student/exams");
    revalidatePath("/student/results");
    return result;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to submit exam");
  }
};

export const getStudentResults = async () => {
  const session = await getStudentSession();

  try {
    const attempts = await prisma.examAttempt.findMany({
      where: { userId: session.user.id, status: { not: "in_progress" } },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        totalScore: true,
        maxScore: true,
        exam: {
          select: {
            title: true,
            resultsPublishedAt: true,
            resultReveal: true,
            createdBy: { select: { name: true } },
          },
        },
        answers: { select: { text: true } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return attempts.map((a) => {
      const visible = isResultVisible(a.exam);
      return {
        id: a.id,
        status: a.status,
        submittedAt: a.submittedAt,
        examTitle: a.exam.title,
        examinerName: a.exam.createdBy.name,
        answeredCount: a.answers.filter((x) => x.text?.trim()).length,
        questionCount: a.answers.length,
        resultsPublished: Boolean(a.exam.resultsPublishedAt),
        resultsVisible: visible,
        totalScore: visible ? a.totalScore : null,
        maxScore: a.maxScore,
      };
    });
  } catch {
    throw new Error("Failed to fetch results");
  }
};

export type StudentResultListItem = Awaited<
  ReturnType<typeof getStudentResults>
>[number];

/**
 * Candidate view of one attempt. Nothing about scores, feedback or answer keys
 * leaves the server until results are published, and then only as far as the
 * exam's `resultReveal` allows.
 */
export const getResultDetail = async (attemptId: string) => {
  const session = await getStudentSession();

  let attempt;
  try {
    attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        status: true,
        submittedAt: true,
        totalScore: true,
        maxScore: true,
        exam: {
          select: {
            title: true,
            resultsPublishedAt: true,
            resultReveal: true,
            passMarkPercent: true,
          },
        },
      },
    });
  } catch {
    throw new Error("Failed to fetch result details");
  }

  if (!attempt || attempt.userId !== session.user.id)
    redirect("/student/results");

  if (!isFinishedAttemptStatus(attempt.status)) redirect("/student/exams");

  const base = {
    attemptId: attempt.id,
    examTitle: attempt.exam.title,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
  };

  if (!attempt.exam.resultsPublishedAt)
    return { ...base, visibility: "awaiting" as const };
  if (attempt.exam.resultReveal === "none")
    return { ...base, visibility: "withheld" as const };

  const showAnswers = attempt.exam.resultReveal === "score_and_answers";
  const [snapshots, answers] = await Promise.all([
    prisma.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { order: "asc" },
    }),
    prisma.answer.findMany({
      where: { attemptId },
      select: {
        id: true,
        questionId: true,
        text: true,
        score: true,
        feedback: true,
        manualScore: true,
        requiresManual: true,
      },
    }),
  ]);

  if (snapshots.length === 0) {
    throw new Error("Exam question snapshots are missing for this attempt");
  }

  const released = {
    ...base,
    visibility: "released" as const,
    showAnswers,
    totalScore: attempt.totalScore,
    maxScore: attempt.maxScore,
    passMarkPercent: attempt.exam.passMarkPercent,
    summary: {
      answered: answers.filter((a) => a.text?.trim()).length,
      questions: snapshots.length,
    },
  };

  // `score_only` keeps per-question scores and feedback but never sends keys.
  const questions = snapshots.map((s) => {
    const manual = isManualQuestion({
      type: s.type,
      answer: s.answer,
      points: s.points,
      markingScheme: s.markingScheme,
    });
    return {
      id: s.sourceQuestionId,
      text: s.text,
      type: s.type,
      options: s.optionOrder ?? s.options,
      // Manual questions store grader guidance, not a candidate-facing key.
      answer: showAnswers && !manual ? s.answer : null,
      manual,
      points: s.points,
      order: s.order,
    };
  });

  return {
    ...released,
    questions,
    answers: answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      text: a.text,
      score: a.score,
      feedback: a.feedback,
      manuallyGraded: a.manualScore != null,
      requiresManual: a.requiresManual,
    })),
  };
};
