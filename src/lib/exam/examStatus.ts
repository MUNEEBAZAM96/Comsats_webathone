import { isAfter, isBefore } from "date-fns";

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

  return "ongoing";
};

/** True when a student may begin a new attempt right now. */
export const canStartExamAttempt = (
  exam: ExamLifecycleFields,
  now: Date = new Date(),
): boolean => getEffectiveExamStatus(exam, now) === "ongoing";
