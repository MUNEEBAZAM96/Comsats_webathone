import "server-only";

import prisma from "@/lib/database/dbClient";
import {
  hashReportPayload,
  type CanonicalCandidateReport,
  type CanonicalExamSummary,
} from "@/features/verification/services/reportHash";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_META_ALLOWLIST = new Set([
  "type",
  "examTitle",
  "totalScore",
  "maxScore",
  "percentage",
  "attemptCount",
  "averageScore",
  "submittedAt",
  "publishedAt",
]);

const allowlistPublicMeta = (raw: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (PUBLIC_META_ALLOWLIST.has(key)) out[key] = value;
  }
  return out;
};

/**
 * Public verification — server-only (not a client-callable server action).
 * Recomputes the content hash from authoritative DB records; never trusts a client hash.
 */
export const verifyPublishedReport = async (reportId: string) => {
  if (!UUID_RE.test(reportId)) {
    return {
      status: "unavailable" as const,
      message: "This report is unavailable or has been revoked.",
    };
  }

  const report = await prisma.reportVerification.findUnique({
    where: { id: reportId },
  });

  if (!report || report.revokedAt) {
    return {
      status: "unavailable" as const,
      message: "This report is unavailable or has been revoked.",
    };
  }

  let recomputed: string | null = null;

  if (report.type === "candidate_result" && report.attemptId) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: report.attemptId },
      include: { exam: { select: { id: true, title: true } } },
    });
    if (!attempt) {
      return {
        status: "unavailable" as const,
        message: "Underlying examination record is no longer available.",
      };
    }
    const payload: CanonicalCandidateReport = {
      type: "candidate_result",
      examId: attempt.examId,
      attemptId: attempt.id,
      examTitle: attempt.exam.title,
      totalScore: attempt.totalScore ?? attempt.autoScore ?? 0,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    };
    recomputed = hashReportPayload(payload);
  } else if (report.type === "exam_summary" && report.examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: report.examId },
      select: { id: true, title: true },
    });
    if (!exam) {
      return {
        status: "unavailable" as const,
        message: "Underlying examination record is no longer available.",
      };
    }
    const attempts = await prisma.examAttempt.findMany({
      where: { examId: exam.id, status: { not: "in_progress" } },
      select: { totalScore: true },
    });
    const averageScore =
      attempts.length === 0 ? 0 : (
        Math.round(
          (attempts.reduce((s, a) => s + (a.totalScore ?? 0), 0) /
            attempts.length) *
            10,
        ) / 10
      );
    const payload: CanonicalExamSummary = {
      type: "exam_summary",
      examId: exam.id,
      examTitle: exam.title,
      attemptCount: attempts.length,
      averageScore,
      // Authoritative publish timestamp from the verification row — never client/meta.
      publishedAt: report.publishedAt.toISOString(),
    };
    recomputed = hashReportPayload(payload);
  }

  if (!recomputed) {
    return {
      status: "unavailable" as const,
      message: "Unable to verify this report type.",
    };
  }

  const valid = recomputed === report.contentHash;
  let publicMeta: Record<string, unknown> = {};
  try {
    publicMeta = allowlistPublicMeta(
      JSON.parse(report.publicMeta) as Record<string, unknown>,
    );
  } catch {
    publicMeta = {};
  }

  return {
    status: valid ? ("valid" as const) : ("invalid" as const),
    message:
      valid ?
        "Report signature matches the current examination record."
      : "Report signature does not match. Data may have been altered.",
    publicMeta,
    publishedAt: report.publishedAt.toISOString(),
    type: report.type,
  };
};
