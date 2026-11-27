"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { addMinutes, isAfter, isBefore, min } from "date-fns";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { autoGrade } from "@/lib/exam/grading";
import {
  canStartExamAttempt,
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

export const getStudentExams = async () => {
  const session = await getStudentSession();

  try {
    const assignments = await prisma.examAssignment.findMany({
      where: { userId: session.user.id },
      include: {
        exam: {
          include: {
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
        autoScore: true,
        totalScore: true,
        maxScore: true,
      },
    });

    const attemptMap = new Map(attempts.map((a) => [a.examId, a]));
    const now = new Date();

    return await Promise.all(
      assignments.map(async ({ exam }) => {
        const synced = await syncExamLifecycle(exam, now);
        return {
          ...withExamApiFields(synced, now),
          attempt: attemptMap.get(exam.id) ?? null,
        };
      }),
    );
  } catch {
    throw new Error("Failed to fetch exams");
  }
};

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

export const startExam = async (examId: string) => {
  const session = await getStudentSession();

  try {
    const assignment = await prisma.examAssignment.findUnique({
      where: { examId_userId: { examId, userId: session.user.id } },
      include: { exam: true },
    });

    if (!assignment) throw new Error("You are not assigned to this exam");

    const now = new Date();
    const exam = await syncExamLifecycle(assignment.exam, now);
    const effective = getEffectiveExamStatus(exam, now);

    // Resume / finalize existing attempts even after the exam auto-completes.
    const existing = await prisma.examAttempt.findUnique({
      where: { userId_examId: { userId: session.user.id, examId } },
      include: { exam: { select: { endTime: true, duration: true } } },
    });

    if (existing) {
      if (existing.status === "in_progress") {
        const durationDeadline = addMinutes(
          existing.startedAt,
          existing.exam.duration,
        );
        const effectiveDeadline =
          existing.exam.endTime ?
            min([existing.exam.endTime, durationDeadline])
          : durationDeadline;

        const windowClosed =
          exam.status === "completed" || effective === "completed";

        if (windowClosed || isAfter(now, effectiveDeadline)) {
          await ensureAttemptSnapshots(existing.id, exam);
          await submitAttempt(existing.id);
          return await prisma.examAttempt.findUnique({
            where: { id: existing.id },
          });
        }

        // Recover missing snapshots so resume does not fail later.
        await ensureAttemptSnapshots(existing.id, exam);
      }
      return existing;
    }

    if (exam.status === "draft" || effective === "draft")
      throw new Error("This exam is not available");
    if (exam.status === "completed" || effective === "completed")
      throw new Error("This exam has ended");

    // New attempts only while effectiveStatus is ongoing (window open).
    if (!canStartExamAttempt(exam, now)) {
      if (exam.startTime && isBefore(now, exam.startTime))
        throw new Error("This exam has not started yet");
      if (exam.endTime && isAfter(now, exam.endTime))
        throw new Error("This exam has ended");
      throw new Error("This exam is not open for attempts yet");
    }

    const attempt = await prisma.$transaction(async (tx) => {
      const questions = await tx.question.findMany({
        where: { examId },
        orderBy: { order: "asc" },
      });
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
    if (e instanceof Error) throw e;
    throw new Error("Failed to start exam");
  }
};

export const getAttemptQuestions = async (attemptId: string) => {
  const session = await getStudentSession();

  let attempt;
  try {
    attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { select: { title: true, duration: true, endTime: true } },
      },
    });
  } catch {
    throw new Error("Failed to load exam questions");
  }

  if (!attempt || attempt.userId !== session.user.id)
    redirect("/student/exams");
  if (attempt.status !== "in_progress")
    return { attempt, questions: [] as never[], answers: [] as never[] };

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
  });

  return { attempt, questions, answers };
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

    const durationDeadline = addMinutes(attempt.startedAt, exam.duration);
    const effectiveDeadline =
      exam.endTime ? min([exam.endTime, durationDeadline]) : durationDeadline;

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

export const submitExam = async (attemptId: string) => {
  const session = await getStudentSession();

  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: true },
    });

    if (!attempt || attempt.userId !== session.user.id)
      throw new Error("Unauthorized");
    if (attempt.status !== "in_progress")
      throw new Error("Exam already submitted");

    // Sync lifecycle; still allow final submit so in-flight work is graded.
    await syncExamLifecycle(attempt.exam);

    await submitAttempt(attemptId);

    revalidatePath("/student/exams");
    revalidatePath(`/student/exams/${attempt.examId}`);
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

  if (attempt.status !== "submitted") redirect("/student/exams");

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
