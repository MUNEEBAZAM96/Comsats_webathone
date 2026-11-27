import "server-only";

import prisma from "@/lib/database/dbClient";
import { roundScore } from "@/lib/exam/grading";
import {
  gradeWrittenAnswerWithGroq,
  isAiGradingConfigured,
} from "@/server/ai/writtenAnswerGrader";

const BATCH_SIZE = 5;

const aiKey = (attemptId: string, answerId: string, clientSeq: number) =>
  `${attemptId}:${answerId}:${clientSeq}`;

/**
 * Grade up to BATCH_SIZE pending written answers for an attempt.
 * Never overwrites examiner overrides (manualScore set / examiner_reviewed).
 */
export const processWrittenAiGradingForAttempt = async (
  attemptId: string,
  options: { forceRetry?: boolean; answerId?: string } = {},
) => {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      exam: {
        select: {
          id: true,
          title: true,
          resultsPublishedAt: true,
        },
      },
    },
  });
  if (!attempt || attempt.status === "in_progress") {
    return { processed: 0, failed: 0, skipped: 0 };
  }
  if (attempt.exam.resultsPublishedAt) {
    return { processed: 0, failed: 0, skipped: 0 };
  }

  const configured = isAiGradingConfigured();

  const pending = await prisma.answer.findMany({
    where: {
      attemptId,
      requiresManual: true,
      manualScore: null,
      ...(options.answerId ? { id: options.answerId } : {}),
      ...(options.forceRetry ?
        {
          OR: [
            { gradingStatus: { in: ["pending", "failed", "processing"] } },
            { gradingStatus: "ai_graded" },
          ],
        }
      : {
          gradingStatus: { in: ["pending", "failed"] },
        }),
    },
    take: BATCH_SIZE,
    orderBy: { id: "asc" },
    include: {
      attemptQuestion: {
        select: {
          text: true,
          type: true,
          answer: true,
          points: true,
          markingScheme: true,
          subjectName: true,
          topicName: true,
        },
      },
    },
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const answer of pending) {
    const snap = answer.attemptQuestion;
    if (!snap) {
      skipped += 1;
      continue;
    }
    // Examiner already reviewed
    if (answer.gradingStatus === "examiner_reviewed" || answer.manualScore != null) {
      skipped += 1;
      continue;
    }

    const idem = aiKey(attemptId, answer.id, answer.clientSeq);
    if (
      !options.forceRetry &&
      answer.aiIdempotencyKey === idem &&
      answer.gradingStatus === "ai_graded"
    ) {
      skipped += 1;
      continue;
    }

    if (!configured) {
      await prisma.answer.update({
        where: { id: answer.id },
        data: {
          gradingStatus: "pending",
          gradingSource: "pending_manual",
          aiErrorMessage: null,
        },
      });
      skipped += 1;
      continue;
    }

    await prisma.answer.update({
      where: { id: answer.id },
      data: {
        gradingStatus: "processing",
        gradingSource: "ai_assisted",
        aiIdempotencyKey: idem,
      },
    });

    const outcome = await gradeWrittenAnswerWithGroq({
      examTitle: attempt.exam.title,
      subject: snap.subjectName,
      topic: snap.topicName,
      questionText: snap.text,
      questionInstructions: null,
      maxScore: snap.points,
      expectedAnswer: snap.answer,
      markingScheme: snap.markingScheme,
      studentAnswer: answer.text ?? "",
    });

    if (!outcome.ok) {
      await prisma.answer.update({
        where: { id: answer.id },
        data: {
          gradingStatus: outcome.unavailable ? "pending" : "failed",
          gradingSource: outcome.unavailable ? "unavailable" : "pending_manual",
          aiErrorMessage: outcome.error.slice(0, 500),
          aiRetryCount: { increment: 1 },
        },
      });
      failed += 1;
      continue;
    }

    const score = roundScore(outcome.result.score);
    await prisma.answer.update({
      where: { id: answer.id },
      data: {
        gradingStatus: "ai_graded",
        gradingSource: "ai_assisted",
        aiScore: score,
        aiConfidence: outcome.result.confidence,
        aiFeedback: JSON.stringify(outcome.result),
        aiGradedAt: new Date(),
        aiErrorMessage: null,
        aiIdempotencyKey: idem,
        // Keep requiresManual + null manualScore until examiner approves.
        feedback: outcome.result.summary.slice(0, 2000),
      },
    });
    processed += 1;
  }

  return { processed, failed, skipped };
};

/** After submit: mark written answers pending, then run a bounded AI batch. */
export const kickoffWrittenAiGrading = async (attemptId: string) => {
  await prisma.answer.updateMany({
    where: {
      attemptId,
      requiresManual: true,
      manualScore: null,
      gradingStatus: "pending",
    },
    data: {
      gradingSource: isAiGradingConfigured() ? "ai_assisted" : "pending_manual",
    },
  });
  await prisma.answer.updateMany({
    where: {
      attemptId,
      requiresManual: false,
    },
    data: {
      gradingStatus: "skipped",
      gradingSource: "automatic",
    },
  });
  try {
    return await processWrittenAiGradingForAttempt(attemptId);
  } catch (error) {
    console.error("[ai-grading] kickoff failed", error);
    return { processed: 0, failed: 0, skipped: 0 };
  }
};
