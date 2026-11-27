import "server-only";

import type { Prisma } from "@generated/prisma/client";
import prisma from "@/lib/database/dbClient";
import { gradeAnswer, roundScore } from "@/lib/exam/grading";
import { shuffleArray, splitLines } from "@/lib/exam/markingScheme";

export type SubmitSource =
  "manual" | "timer" | "resume_finalize" | "server_sweep";

type Tx = Prisma.TransactionClient;

export class AttemptNotInProgressError extends Error {
  constructor() {
    super("Exam already submitted");
    this.name = "AttemptNotInProgressError";
  }
}

/**
 * Lock the attempt row for the rest of the transaction. Saves and submission
 * both take this lock, so an answer can never land after grading has read the
 * answers.
 */
export const lockAttempt = async (tx: Tx, attemptId: string) => {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status" FROM "exam_attempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  return rows[0]?.status ?? null;
};

/** Create AttemptQuestion rows if an in-progress attempt has none (recovery). */
export const ensureAttemptSnapshots = async (
  attemptId: string,
  exam: { id: string; shuffleQuestions: boolean; shuffleOptions: boolean },
) => {
  const existingCount = await prisma.attemptQuestion.count({
    where: { attemptId },
  });
  if (existingCount > 0) return;

  const questions = await prisma.question.findMany({
    where: { examId: exam.id },
    orderBy: { order: "asc" },
    include: {
      section: { select: { title: true, instructions: true } },
    },
  });
  if (questions.length === 0) return;

  await prisma.attemptQuestion.createMany({
    data: buildSnapshotRows(attemptId, questions, exam),
    skipDuplicates: true,
  });
};

export const buildSnapshotRows = (
  attemptId: string,
  questions: {
    id: string;
    text: string;
    type: string;
    options: string | null;
    answer: string | null;
    points: number;
    difficulty: string;
    markingScheme: string | null;
    topicName?: string | null;
    subjectName?: string | null;
    section?: { title: string; instructions: string | null } | null;
  }[],
  exam: { shuffleQuestions: boolean; shuffleOptions: boolean },
) => {
  const ordered = exam.shuffleQuestions ? shuffleArray(questions) : questions;
  return ordered.map((q, index) => {
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
      topicName: q.topicName,
      subjectName: q.subjectName,
      sectionTitle: q.section?.title ?? null,
      sectionInstructions: q.section?.instructions ?? null,
      optionOrder,
    };
  });
};

/**
 * Recompute an attempt's totals from its answers. An attempt is `graded` once
 * no answer still waits for a manual mark.
 */
export const recomputeAttemptTotals = async (
  tx: Tx,
  attemptId: string,
  gradedById: string | null,
) => {
  const answers = await tx.answer.findMany({
    where: { attemptId },
    select: {
      score: true,
      autoScore: true,
      manualScore: true,
      requiresManual: true,
    },
  });
  const pending = answers.filter(
    (a) => a.requiresManual && a.manualScore == null,
  ).length;
  // A manual mark (grading or override) replaces the auto score, so
  // total = autoScore (answers without a manual mark) + manualScore.
  const autoScore = roundScore(
    answers
      .filter((a) => a.manualScore == null && !a.requiresManual)
      .reduce((sum, a) => sum + (a.score ?? 0), 0),
  );
  const manualScore = roundScore(
    answers.reduce((sum, a) => sum + (a.manualScore ?? 0), 0),
  );
  const total = roundScore(autoScore + manualScore);

  const current = await tx.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { status: true, gradedAt: true },
  });
  if (current.status === "in_progress") return { pending, total: null };

  await tx.examAttempt.update({
    where: { id: attemptId },
    data: {
      autoScore,
      manualScore: answers.some((a) => a.manualScore != null)
        ? manualScore
        : null,
      totalScore: pending > 0 ? null : total,
      status: pending > 0 ? "submitted" : "graded",
      gradedAt: pending > 0 ? null : (current.gradedAt ?? new Date()),
      ...(pending === 0 && gradedById ? { gradedById } : {}),
    },
  });
  return { pending, total: pending > 0 ? null : total };
};

/**
 * Finalize and auto-grade an in-progress attempt from its snapshots.
 * Throws `AttemptNotInProgressError` if it is already finished.
 */
export const finalizeAttempt = async (
  attemptId: string,
  source: SubmitSource,
) =>
  prisma.$transaction(
    async (tx) => {
      const status = await lockAttempt(tx, attemptId);
      if (status !== "in_progress") throw new AttemptNotInProgressError();

      const attempt = await tx.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { examId: true },
      });
      const snapshots = await tx.attemptQuestion.findMany({
        where: { attemptId },
        orderBy: { order: "asc" },
      });
      if (snapshots.length === 0)
        throw new Error("Exam question snapshots are missing for this attempt");

      const answers = await tx.answer.findMany({ where: { attemptId } });
      const answerMap = new Map(answers.map((a) => [a.questionId, a]));

      let autoScore = 0;
      let pending = 0;
      const maxScore = snapshots.reduce((sum, s) => sum + s.points, 0);

      for (const snap of snapshots) {
        const answer = answerMap.get(snap.sourceQuestionId);
        const result = gradeAnswer(answer?.text ?? "", {
          type: snap.type,
          answer: snap.answer,
          points: snap.points,
          markingScheme: snap.markingScheme,
          options: snap.options,
        });
        if (result.requiresManual) pending++;
        else autoScore += result.score ?? 0;

        const graded = {
          attemptQuestionId: snap.id,
          requiresManual: result.requiresManual,
          autoScore: result.requiresManual ? null : result.score,
          score: result.requiresManual ? null : result.score,
          manualScore: null,
          feedback: null,
        };
        if (answer) {
          await tx.answer.update({ where: { id: answer.id }, data: graded });
        } else {
          await tx.answer.create({
            data: {
              attemptId,
              questionId: snap.sourceQuestionId,
              text: "",
              ...graded,
            },
          });
        }
      }

      const now = new Date();
      autoScore = roundScore(autoScore);
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: pending > 0 ? "submitted" : "graded",
          submittedAt: now,
          submitSource: source,
          autoScore,
          manualScore: null,
          totalScore: pending > 0 ? null : autoScore,
          maxScore,
          gradedAt: pending > 0 ? null : now,
        },
      });

      if (source !== "manual") {
        await tx.attemptEvent.create({
          data: {
            attemptId,
            examId: attempt.examId,
            type: "auto_submitted",
            detail: JSON.stringify({ source }),
          },
        });
      }

      return { status: pending > 0 ? "submitted" : "graded", pending };
    },
    { timeout: 30_000 },
  );

/** Finalize, treating "someone else already finished it" as success. */
export const finalizeAttemptIdempotent = async (
  attemptId: string,
  source: SubmitSource,
) => {
  try {
    const result = await finalizeAttempt(attemptId, source);
    // Bounded AI pass for written answers — never blocks objective grading.
    if (result.pending > 0) {
      const { kickoffWrittenAiGrading } = await import(
        "@/server/ai/processWrittenAiGrading"
      );
      await kickoffWrittenAiGrading(attemptId);
    }
    return { status: result.status, alreadySubmitted: false };
  } catch (e) {
    const current = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    if (current && current.status !== "in_progress") {
      // Still try AI for already-submitted attempts missing AI grades.
      const { kickoffWrittenAiGrading } = await import(
        "@/server/ai/processWrittenAiGrading"
      );
      await kickoffWrittenAiGrading(attemptId).catch(() => undefined);
      return { status: current.status, alreadySubmitted: true };
    }
    throw e;
  }
};
