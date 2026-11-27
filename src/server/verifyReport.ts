import "server-only";

import { z } from "zod";
import prisma from "@/lib/database/dbClient";
import {
  hashReportPayload,
  publicMetaFromCandidate,
  publicMetaFromSummary,
  type CanonicalReport,
} from "@/features/verification/services/reportHash";
import { getReportExamSummary } from "@/server/reportData";

const unavailable = {
  status: "unavailable",
  message: "This report is unavailable or has been revoked.",
} as const;

export const verifyPublishedReport = async (reportId: string) => {
  if (!z.uuid().safeParse(reportId).success) return unavailable;
  const report = await prisma.reportVerification.findUnique({
    where: { id: reportId },
  });
  if (!report || report.revokedAt) return unavailable;

  let payload: CanonicalReport;
  if (report.type === "candidate_result" && report.attemptId) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: report.attemptId },
      select: {
        id: true,
        examId: true,
        totalScore: true,
        maxScore: true,
        status: true,
        submittedAt: true,
        exam: {
          select: { title: true, resultsPublishedAt: true, resultReveal: true },
        },
      },
    });
    if (
      !attempt ||
      attempt.status !== "graded" ||
      attempt.totalScore === null ||
      !attempt.exam.resultsPublishedAt ||
      attempt.exam.resultReveal === "none"
    )
      return unavailable;
    payload = {
      type: "candidate_result",
      examId: attempt.examId,
      attemptId: attempt.id,
      examTitle: attempt.exam.title,
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    };
  } else if (report.type === "exam_summary" && report.examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: report.examId },
      select: { id: true, title: true, resultsPublishedAt: true },
    });
    if (!exam?.resultsPublishedAt) return unavailable;
    const summary = await getReportExamSummary(exam.id);
    let averageScore = report.documentVersion
      ? summary.averageScore
      : (summary.averageScore ?? 0);
    if (!report.documentVersion && summary.finished) {
      const legacy = await prisma.examAttempt.aggregate({
        where: { examId: exam.id, status: { not: "in_progress" } },
        _sum: { totalScore: true },
      });
      averageScore =
        Math.round(((legacy._sum.totalScore ?? 0) / summary.finished) * 10) /
        10;
    }
    payload = {
      type: "exam_summary",
      examId: exam.id,
      examTitle: exam.title,
      attemptCount: summary.finished,
      averageScore,
      publishedAt: report.publishedAt.toISOString(),
    };
  } else {
    return unavailable;
  }

  if (hashReportPayload(payload) !== report.contentHash)
    return {
      status: "invalid" as const,
      message:
        "The published report hash differs from the current examination record.",
    };
  const metadata =
    payload.type === "candidate_result"
      ? publicMetaFromCandidate(payload, report.publishedAt)
      : publicMetaFromSummary(payload, report.publishedAt);
  return {
    status: "valid" as const,
    message:
      "The published report hash matches the examination record. Check the PDF below to confirm file integrity.",
    publicMeta: JSON.parse(metadata) as Record<string, unknown>,
    pdfHash: report.pdfHash,
  };
};
