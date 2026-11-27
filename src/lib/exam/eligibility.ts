import { isAfter } from "date-fns";
import { getEffectiveAttemptDeadline } from "@/lib/date/exam-time";
import {
  getEffectiveExamStatus,
  type EffectiveExamStatus,
  type ExamLifecycleFields,
} from "@/lib/exam/examStatus";

/**
 * Single source of truth for what a candidate can do with an assigned exam.
 * Pure: callers pass the server clock (`now`) so the browser clock is never
 * used to decide eligibility.
 */

export type CandidateAttemptInfo = {
  id: string;
  status: string;
  startedAt: Date;
};

export type CandidateExamInput = ExamLifecycleFields & {
  duration: number;
  questionCount: number;
};

/** Which candidate list the exam belongs in. `hidden` = draft, never shown. */
export type CandidateExamBucket = "available" | "upcoming" | "completed" | "hidden";

export type CandidateExamState =
  | "scheduled"
  | "available"
  | "in_progress"
  | "time_up"
  | "submitted"
  | "graded"
  | "missed"
  | "no_questions"
  | "unavailable";

export type CandidateExamAction = "start" | "resume" | "view_result" | "none";

export type CandidateExamEligibility = {
  bucket: CandidateExamBucket;
  state: CandidateExamState;
  action: CandidateExamAction;
  effectiveStatus: EffectiveExamStatus;
  /** Server-computed attempt deadline for in-progress attempts. */
  attemptDeadline: Date | null;
};

const FINISHED_ATTEMPT_STATUSES = new Set(["submitted", "graded"]);

export const isFinishedAttemptStatus = (status: string) =>
  FINISHED_ATTEMPT_STATUSES.has(status);

export const getCandidateExamEligibility = (
  exam: CandidateExamInput,
  attempt: CandidateAttemptInfo | null,
  now: Date,
): CandidateExamEligibility => {
  const effectiveStatus = getEffectiveExamStatus(exam, now);

  if (attempt && isFinishedAttemptStatus(attempt.status)) {
    return {
      bucket: "completed",
      state: attempt.status === "graded" ? "graded" : "submitted",
      action: "view_result",
      effectiveStatus,
      attemptDeadline: null,
    };
  }

  if (attempt && attempt.status === "in_progress") {
    const attemptDeadline = getEffectiveAttemptDeadline(
      attempt.startedAt,
      exam.duration,
      exam.endTime,
    );
    const expired =
      isAfter(now, attemptDeadline) || effectiveStatus === "completed";
    // Opening an expired attempt makes the server finalize it (startExam).
    return {
      bucket: expired ? "completed" : "available",
      state: expired ? "time_up" : "in_progress",
      action: "resume",
      effectiveStatus,
      attemptDeadline,
    };
  }

  if (effectiveStatus === "draft") {
    return {
      bucket: "hidden",
      state: "unavailable",
      action: "none",
      effectiveStatus,
      attemptDeadline: null,
    };
  }

  if (effectiveStatus === "published") {
    return {
      bucket: "upcoming",
      state: "scheduled",
      action: "none",
      effectiveStatus,
      attemptDeadline: null,
    };
  }

  if (effectiveStatus === "completed") {
    return {
      bucket: "completed",
      state: "missed",
      action: "none",
      effectiveStatus,
      attemptDeadline: null,
    };
  }

  if (exam.questionCount < 1) {
    return {
      bucket: "available",
      state: "no_questions",
      action: "none",
      effectiveStatus,
      attemptDeadline: null,
    };
  }

  return {
    bucket: "available",
    state: "available",
    action: "start",
    effectiveStatus,
    attemptDeadline: null,
  };
};

/**
 * Candidate-safe reason a *new* attempt cannot start, or null when it can.
 * Mirrors `getCandidateExamEligibility` for the no-attempt case.
 */
export const getStartBlockReason = (
  exam: CandidateExamInput,
  now: Date,
): string | null => {
  const { state } = getCandidateExamEligibility(exam, null, now);
  switch (state) {
    case "available":
      return null;
    case "scheduled":
      return "This exam has not started yet";
    case "missed":
      return "This exam has ended";
    case "no_questions":
      return "This exam has no questions yet. Contact your examiner.";
    default:
      return "This exam is not available";
  }
};
