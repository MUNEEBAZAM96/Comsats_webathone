"use server";

import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { formatDisplayDateTime } from "@/lib/date/format";
import { serverEnv } from "@/lib/env/serverEnv";
import { CandidateResultDocument } from "@/features/reports/templates/CandidateResultPdf";
import { renderPdfToBuffer } from "@/features/reports/services/renderPdf";
import { generateVerificationQrDataUrl } from "@/features/verification/services/qr";
import {
  hashReportPayload,
  publicMetaFromCandidate,
  publicMetaFromSummary,
  type CanonicalCandidateReport,
  type CanonicalExamSummary,
} from "@/features/verification/services/reportHash";

const requirePublisher = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    throw new Error("Not authorized");
  return session;
};

const assertCanPublishExam = async (
  session: { user: { id: string; role?: string | null } },
  exam: { id: string; createdById: string },
) => {
  if (session.user.role === "admin") return;
  if (session.user.role === "examiner" && exam.createdById === session.user.id)
    return;
  throw new Error("Not authorized");
};

const assertCanPublishAttempt = async (
  session: { user: { id: string; role?: string | null } },
  attempt: { examId: string; exam: { createdById: string } },
) => {
  await assertCanPublishExam(session, {
    id: attempt.examId,
    createdById: attempt.exam.createdById,
  });
};

export const publishCandidateResultReport = async (attemptId: string) => {
  const session = await requirePublisher();

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        select: { id: true, title: true, createdById: true, resultsPublishedAt: true },
      },
      user: { select: { name: true } },
      answers: {
        where: { feedback: { not: null } },
        select: {
          feedback: true,
          score: true,
          attemptQuestion: { select: { order: true, points: true } },
        },
      },
    },
  });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.status === "in_progress")
    throw new Error("Cannot publish report for an in-progress attempt");

  await assertCanPublishAttempt(session, attempt);
  if (!attempt.exam.resultsPublishedAt)
    throw new Error("Publish the exam's results before issuing a result report");
  if (attempt.totalScore === null)
    throw new Error("This attempt still has answers waiting for a manual mark");
  const totalScore = attempt.totalScore;

  const payload: CanonicalCandidateReport = {
    type: "candidate_result",
    examId: attempt.examId,
    attemptId: attempt.id,
    examTitle: attempt.exam.title,
    totalScore,
    maxScore: attempt.maxScore,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  };

  const contentHash = hashReportPayload(payload);
  const publishedAt = new Date();

  const existing = await prisma.reportVerification.findFirst({
    where: {
      attemptId: attempt.id,
      type: "candidate_result",
      revokedAt: null,
    },
    orderBy: { publishedAt: "desc" },
  });
  if (existing) {
    await prisma.reportVerification.update({
      where: { id: existing.id },
      data: { revokedAt: publishedAt },
    });
  }

  const report = await prisma.reportVerification.create({
    data: {
      type: "candidate_result",
      examId: attempt.examId,
      attemptId: attempt.id,
      contentHash,
      publicMeta: publicMetaFromCandidate(payload, publishedAt),
      publishedById: session.user.id,
      publishedAt,
    },
  });

  const verifyUrl = `${serverEnv.BETTER_AUTH_URL.replace(/\/$/, "")}/verify/${report.id}`;
  const qrDataUrl = await generateVerificationQrDataUrl(verifyUrl);

  const percentage =
    attempt.maxScore > 0 ?
      Math.round((totalScore / attempt.maxScore) * 1000) / 10
    : 0;

  const feedback = attempt.answers
    .filter((a) => a.feedback?.trim() && a.attemptQuestion)
    .sort((a, b) => (a.attemptQuestion?.order ?? 0) - (b.attemptQuestion?.order ?? 0))
    .map((a) => ({
      question: (a.attemptQuestion?.order ?? 0) + 1,
      score: a.score,
      points: a.attemptQuestion?.points ?? 0,
      text: a.feedback ?? "",
    }));

  const pdfBuffer = await renderPdfToBuffer(
    createElement(CandidateResultDocument, {
      examTitle: attempt.exam.title,
      candidateLabel: attempt.user.name,
      feedback,
      totalScore,
      maxScore: attempt.maxScore,
      percentage,
      submittedAt:
        attempt.submittedAt ?
          formatDisplayDateTime(attempt.submittedAt)
        : null,
      publishedAt: formatDisplayDateTime(publishedAt),
      reportId: report.id,
    }) as React.ReactElement<import("@react-pdf/renderer").DocumentProps>,
  );

  return {
    reportId: report.id,
    verifyUrl,
    qrDataUrl,
    contentHash,
    pdfBase64: pdfBuffer.toString("base64"),
  };
};

export const publishExamSummaryReport = async (examId: string) => {
  const session = await requirePublisher();
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, createdById: true, resultsPublishedAt: true },
  });
  if (!exam) throw new Error("Exam not found");
  await assertCanPublishExam(session, exam);
  if (!exam.resultsPublishedAt)
    throw new Error("Publish the exam's results before issuing a summary report");

  const attempts = await prisma.examAttempt.findMany({
    where: { examId, status: { not: "in_progress" } },
    select: { totalScore: true, maxScore: true },
  });

  const averageScore =
    attempts.length === 0 ? 0 : (
      Math.round(
        (attempts.reduce((s, a) => s + (a.totalScore ?? 0), 0) /
          attempts.length) *
          10,
      ) / 10
    );

  const publishedAt = new Date();
  const payload: CanonicalExamSummary = {
    type: "exam_summary",
    examId: exam.id,
    examTitle: exam.title,
    attemptCount: attempts.length,
    averageScore,
    publishedAt: publishedAt.toISOString(),
  };

  const contentHash = hashReportPayload(payload);
  const report = await prisma.reportVerification.create({
    data: {
      type: "exam_summary",
      examId: exam.id,
      contentHash,
      publicMeta: publicMetaFromSummary(payload, publishedAt),
      publishedById: session.user.id,
      publishedAt,
    },
  });

  const verifyUrl = `${serverEnv.BETTER_AUTH_URL.replace(/\/$/, "")}/verify/${report.id}`;
  const qrDataUrl = await generateVerificationQrDataUrl(verifyUrl);

  return {
    reportId: report.id,
    verifyUrl,
    qrDataUrl,
    contentHash,
    summary: payload,
  };
};
