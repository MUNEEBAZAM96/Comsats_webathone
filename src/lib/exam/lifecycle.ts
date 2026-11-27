import "server-only";

import { isAfter } from "date-fns";
import prisma from "@/lib/database/dbClient";
import {
  getEffectiveExamStatus,
  type ExamLifecycleFields,
  type StoredExamStatus,
} from "@/lib/exam/examStatus";

export {
  canStartExamAttempt,
  getEffectiveExamStatus,
  type EffectiveExamStatus,
  type ExamLifecycleFields,
  type StoredExamStatus,
} from "@/lib/exam/examStatus";

export const STORED_EXAM_STATUSES: readonly StoredExamStatus[] = [
  "draft",
  "published",
  "completed",
] as const;

export const sumQuestionPoints = async (examId: string): Promise<number> => {
  const agg = await prisma.question.aggregate({
    where: { examId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
};

/** Recompute and persist totalMarks for a draft (or any) exam. */
export const refreshExamTotalMarks = async (examId: string): Promise<number> => {
  const totalMarks = await sumQuestionPoints(examId);
  await prisma.exam.update({
    where: { id: examId },
    data: { totalMarks },
  });
  return totalMarks;
};

/**
 * If stored status is published and endTime has passed, flip to completed.
 * Idempotent. Never writes `ongoing`.
 */
export const syncExamLifecycle = async <
  T extends ExamLifecycleFields & { id: string },
>(
  exam: T,
  now: Date = new Date(),
): Promise<T> => {
  if (
    exam.status === "published" &&
    exam.endTime &&
    isAfter(now, exam.endTime)
  ) {
    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: { status: "completed" },
    });
    return { ...exam, status: updated.status };
  }
  return exam;
};

export const syncExamLifecycleById = async (examId: string, now?: Date) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return null;
  return syncExamLifecycle(exam, now);
};

export const assertCanPublishExam = (exam: {
  status: string;
  duration: number;
  startTime: Date | null;
  endTime: Date | null;
  questionCount: number;
}) => {
  if (exam.status !== "draft") {
    throw new Error("Only draft exams can be published");
  }
  if (exam.questionCount < 1) {
    throw new Error("Publish requires at least one question");
  }
  if (!Number.isInteger(exam.duration) || exam.duration < 1) {
    throw new Error("Publish requires a duration of at least 1 minute");
  }
  if (!exam.startTime || !exam.endTime) {
    throw new Error("Publish requires both start time and end time");
  }
  if (!isAfter(exam.endTime, exam.startTime)) {
    throw new Error("End time must be after start time");
  }
};

export const withExamApiFields = <T extends ExamLifecycleFields>(
  exam: T,
  now: Date = new Date(),
) => ({
  ...exam,
  effectiveStatus: getEffectiveExamStatus(exam, now),
  totalMarks: exam.totalMarks ?? 0,
  instructions:
    "instructions" in exam ?
      ((exam as T & { instructions?: string | null }).instructions ?? null)
    : null,
});
