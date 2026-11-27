import "server-only";

import { isAfter, isBefore } from "date-fns";
import prisma from "@/lib/database/dbClient";

/** Statuses that may be written to Exam.status. Never store `ongoing`. */
export type StoredExamStatus = "draft" | "published" | "completed";

/** Status exposed to API consumers (ongoing is derived only). */
export type EffectiveExamStatus =
  | "draft"
  | "published"
  | "ongoing"
  | "completed";

export type ExamLifecycleFields = {
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  totalMarks?: number;
};

export const STORED_EXAM_STATUSES: readonly StoredExamStatus[] = [
  "draft",
  "published",
  "completed",
] as const;

/**
 * Derive the client-facing status. `ongoing` is never persisted.
 *
 * Rules for stored `published`:
 * - before startTime → published (scheduled)
 * - after endTime → completed (caller should sync DB; getter may still report completed)
 * - inside window (missing bound = open on that side) → ongoing
 */
export const getEffectiveExamStatus = (
  exam: ExamLifecycleFields,
  now: Date = new Date(),
): EffectiveExamStatus => {
  if (exam.status === "draft") return "draft";
  if (exam.status === "completed") return "completed";
  if (exam.status !== "published") return "draft";

  if (exam.startTime && isBefore(now, exam.startTime)) return "published";
  if (exam.endTime && isAfter(now, exam.endTime)) return "completed";

  const afterStart = !exam.startTime || !isBefore(now, exam.startTime);
  const beforeEnd = !exam.endTime || !isAfter(now, exam.endTime);
  if (afterStart && beforeEnd) return "ongoing";

  return "published";
};

/** True when a student may begin a new attempt right now. */
export const canStartExamAttempt = (
  exam: ExamLifecycleFields,
  now: Date = new Date(),
): boolean => getEffectiveExamStatus(exam, now) === "ongoing";

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
