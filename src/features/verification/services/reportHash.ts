import { createHash } from "node:crypto";

export type CanonicalCandidateReport = {
  type: "candidate_result";
  examId: string;
  attemptId: string;
  examTitle: string;
  totalScore: number;
  maxScore: number;
  submittedAt: string | null;
};

export type CanonicalExamSummary = {
  type: "exam_summary";
  examId: string;
  examTitle: string;
  attemptCount: number;
  averageScore: number;
  publishedAt: string;
};

export type CanonicalReport = CanonicalCandidateReport | CanonicalExamSummary;

/** Stable JSON for hashing — sorted keys, no PII. */
export const canonicalizeReport = (payload: CanonicalReport): string =>
  JSON.stringify(payload, Object.keys(payload).sort());

export const hashReportPayload = (payload: CanonicalReport): string =>
  createHash("sha256").update(canonicalizeReport(payload), "utf8").digest("hex");

export const publicMetaFromCandidate = (
  payload: CanonicalCandidateReport,
  publishedAt: Date,
) =>
  JSON.stringify({
    examTitle: payload.examTitle,
    totalScore: payload.totalScore,
    maxScore: payload.maxScore,
    percentage:
      payload.maxScore > 0 ?
        Math.round((payload.totalScore / payload.maxScore) * 1000) / 10
      : 0,
    submittedAt: payload.submittedAt,
    publishedAt: publishedAt.toISOString(),
    type: payload.type,
  });

export const publicMetaFromSummary = (
  payload: CanonicalExamSummary,
  publishedAt: Date,
) =>
  JSON.stringify({
    examTitle: payload.examTitle,
    attemptCount: payload.attemptCount,
    averageScore: payload.averageScore,
    publishedAt: publishedAt.toISOString(),
    type: payload.type,
  });
