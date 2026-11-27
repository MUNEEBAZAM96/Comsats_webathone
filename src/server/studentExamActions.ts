"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAfter } from "date-fns";
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
import { autoGrade } from "@/lib/exam/grading";
import {
  getEffectiveExamStatus,
  syncExamLifecycle,
  withExamApiFields,
} from "@/lib/exam/lifecycle";
import { shuffleArray, splitLines } from "@/lib/exam/markingScheme";

const getStudentSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "student") redirect("/");
  return session;
};

/**
 * Assigned exams for the signed-in candidate with server-computed eligibility.
 * Draft exams are omitted. `serverNow` is the clock every bucket was derived from.
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
        autoScore: true,
        totalScore: true,
        maxScore: true,
      },
    });

    const attemptMap = new Map(attempts.map((a) => [a.examId, a]));
    const now = new Date();

    const exams = await Promise.all(
      assignments.map(async ({ exam }) => {
        const synced = await syncExamLifecycle(exam, now);
        const attempt = attemptMap.get(exam.id) ?? null;
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

/** Create AttemptQuestion rows if an in-progress attempt has none (recovery). */
const ensureAttemptSnapshots = async (
  attemptId: string,
  exam: {
    id: string;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  },
) => {
  const existingCount = await prisma.attemptQuestion.count({
    where: { attemptId },
  });
  if (existingCount > 0) return;

  const questions = await prisma.question.findMany({
    where: { examId: exam.id },
    orderBy: { order: "asc" },
  });
  if (questions.length === 0) return;

  const ordered = exam.shuffleQuestions ? shuffleArray(questions) : questions;

  await prisma.attemptQuestion.createMany({
    data: ordered.map((q, index) => {
      let optionOrder: string | null = null;
      if (
        exam.shuffleOptions &&
        (q.type === "multiple_choice" ||
          q.type === "single_choice" ||
          q.type === "true_false")
      ) {
        const opts = splitLines(q.options);
        if (opts.length > 1) optionOrder = shuffleArray(opts).join("\n");
      }
      return {
        attemptId,
        sourceQuestionId: q.id,
        text: q.text,
        type: q.type,
        options: q.options,
        answer: q.answer,
        points: q.points,
        order: index,
        difficulty: q.difficulty,
        markingScheme: q.markingScheme,
        optionOrder,
      };
    }),
    skipDuplicates: true,
  });
};

const finalizeExpiredAttempt = async (
  attemptId: string,
  exam: { id: string; shuffleQuestions: boolean; shuffleOptions: boolean },
) => {
  await ensureAttemptSnapshots(attemptId, exam);
  try {
    await submitAttempt(attemptId);
  } catch (e) {
    // A concurrent request may have finalized it first; that is fine.
    const current = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    if (!current || current.status === "in_progress") throw e;
  }
  return prisma.examAttempt.findUnique({ where: { id: attemptId } });
};

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
          return await finalizeExpiredAttempt(existing.id, exam);
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
      });
      if (questions.length === 0)
        throw new Error("This exam has no questions yet. Contact your examiner.");
      const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

      const created = await tx.examAttempt.create({
        data: {
          userId: session.user.id,
          examId,
          maxScore,
        },
      });

      const ordered =
        exam.shuffleQuestions ? shuffleArray(questions) : questions;

      await tx.attemptQuestion.createMany({
        data: ordered.map((q, index) => {
          let optionOrder: string | null = null;
          if (
            exam.shuffleOptions &&
            (q.type === "multiple_choice" ||
              q.type === "single_choice" ||
              q.type === "true_false")
          ) {
            const opts = splitLines(q.options);
            if (opts.length > 1) {
              optionOrder = shuffleArray(opts).join("\n");
            }
          }

          return {
            attemptId: created.id,
            sourceQuestionId: q.id,
            text: q.text,
            type: q.type,
            options: q.options,
            answer: q.answer,
            points: q.points,
            order: index,
            difficulty: q.difficulty,
            markingScheme: q.markingScheme,
            optionOrder,
          };
        }),
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

/**
 * Authoritative remaining time for an attempt, computed from the server clock.
 * The exam player uses this to correct client timer drift; it never extends time.
 */
export const getAttemptClock = async (attemptId: string) => {
  const session = await getStudentSession();

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      status: true,
      startedAt: true,
      exam: { select: { duration: true, endTime: true } },
    },
  });
  if (!attempt || attempt.userId !== session.user.id)
    throw new Error("Unauthorized");

  const now = new Date();
  const deadline = getEffectiveAttemptDeadline(
    attempt.startedAt,
    attempt.exam.duration,
    attempt.exam.endTime,
  );

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
      include: {
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
  const deadline = getEffectiveAttemptDeadline(
    attempt.startedAt,
    attempt.exam.duration,
    attempt.exam.endTime,
  );
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
    select: { questionId: true, text: true },
  });

  return { attempt, clock, questions, answers };
};

const MAX_ANSWER_CHARS = 50_000;

export const saveAnswer = async (
  attemptId: string,
  questionId: string,
  text: string,
) => {
  const session = await getStudentSession();

  try {
    if (typeof text !== "string" || text.length > MAX_ANSWER_CHARS)
      throw new Error("Answer exceeds maximum length");

    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            duration: true,
            totalMarks: true,
          },
        },
      },
    });
    if (!attempt || attempt.userId !== session.user.id)
      throw new Error("Unauthorized");
    if (attempt.status !== "in_progress")
      throw new Error("Exam already submitted");

    const now = new Date();
    const exam = await syncExamLifecycle(attempt.exam, now);
    if (exam.status === "completed" || exam.status === "draft")
      throw new Error("This exam is no longer accepting answers");

    const effectiveDeadline = getEffectiveAttemptDeadline(
      attempt.startedAt,
      exam.duration,
      exam.endTime,
    );

    if (isAfter(now, effectiveDeadline))
      throw new Error("The exam time has expired");

    const snapshot = await prisma.attemptQuestion.findUnique({
      where: {
        attemptId_sourceQuestionId: {
          attemptId,
          sourceQuestionId: questionId,
        },
      },
    });
    if (!snapshot) throw new Error("Question not found");

    await prisma.$transaction(async (tx) => {
      const current = await tx.examAttempt.findUnique({
        where: { id: attemptId },
        select: { status: true },
      });
      if (!current || current.status !== "in_progress")
        throw new Error("Exam already submitted");

      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId } },
        create: {
          attemptId,
          questionId,
          attemptQuestionId: snapshot.id,
          text,
        },
        update: { text, attemptQuestionId: snapshot.id },
      });
    });
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to save answer");
  }
};

const submitAttempt = async (attemptId: string) => {
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.examAttempt.findUnique({
        where: { id: attemptId },
        select: { status: true },
      });
      if (!current || current.status !== "in_progress")
        throw new Error("Exam already submitted");

      const snapshots = await tx.attemptQuestion.findMany({
        where: { attemptId },
        orderBy: { order: "asc" },
      });

      if (snapshots.length === 0) {
        throw new Error("Exam question snapshots are missing for this attempt");
      }

      const answers = await tx.answer.findMany({
        where: { attemptId },
      });

      const answerMap = new Map(answers.map((a) => [a.questionId, a]));

      let autoScore = 0;
      const maxScore = snapshots.reduce((sum, s) => sum + s.points, 0);
      for (const snap of snapshots) {
        const answer = answerMap.get(snap.sourceQuestionId);
        const text = answer?.text ?? "";
        const score = autoGrade(text, {
          type: snap.type,
          answer: snap.answer,
          points: snap.points,
          markingScheme: snap.markingScheme,
        });
        autoScore += score;

        if (answer) {
          await tx.answer.update({
            where: { id: answer.id },
            data: { score, attemptQuestionId: snap.id },
          });
        }
      }

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          autoScore,
          totalScore: autoScore,
          maxScore,
        },
      });
    },
    { timeout: 30_000 },
  );
};

/**
 * Finalize and auto-grade an attempt. Idempotent: submitting an attempt that is
 * already finished succeeds without re-grading. Submission never accepts new
 * answers — late writes are rejected by `saveAnswer`, so finalizing after the
 * deadline only grades what the server already holds.
 */
export const submitExam = async (attemptId: string) => {
  const session = await getStudentSession();

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

    try {
      await submitAttempt(attemptId);
    } catch (e) {
      const current = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        select: { status: true },
      });
      if (current && isFinishedAttemptStatus(current.status))
        return { status: current.status, alreadySubmitted: true };
      throw e;
    }

    revalidatePath("/student");
    revalidatePath("/student/exams");
    revalidatePath("/student/results");
    return { status: "submitted", alreadySubmitted: false };
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
      include: {
        exam: {
          select: { title: true, createdBy: { select: { name: true } } },
        },
        _count: { select: { answers: true } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return attempts;
  } catch {
    throw new Error("Failed to fetch results");
  }
};

export const getResultDetail = async (attemptId: string) => {
  const session = await getStudentSession();

  let attempt;
  try {
    attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: { orderBy: { order: "asc" } },
          },
        },
        answers: true,
        questions: { orderBy: { order: "asc" } },
      },
    });
  } catch {
    throw new Error("Failed to fetch result details");
  }

  if (!attempt || attempt.userId !== session.user.id)
    redirect("/student/results");

  if (!isFinishedAttemptStatus(attempt.status)) redirect("/student/exams");

  if (attempt.questions.length === 0) {
    throw new Error("Exam question snapshots are missing for this attempt");
  }

  // Prefer attempt snapshots for review (frozen text/answer/points/order).
  const questions = attempt.questions.map((s) => ({
    id: s.sourceQuestionId,
    text: s.text,
    type: s.type,
    options: s.optionOrder ?? s.options,
    answer: s.answer,
    points: s.points,
    order: s.order,
    difficulty: s.difficulty,
  }));
  return {
    ...attempt,
    exam: { ...attempt.exam, questions },
  };
};
