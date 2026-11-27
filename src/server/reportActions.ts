"use server";

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createElement, type ComponentProps } from "react";
import { z } from "zod";
import prisma from "@/lib/database/dbClient";
import { formatDisplayDateTime } from "@/lib/date/format";
import { formatScore } from "@/lib/exam/grading";
import { serverEnv } from "@/lib/env/serverEnv";
import { getExamAnalytics } from "@/features/analytics/services/examAnalytics";
import { CandidateResultDocument } from "@/features/reports/templates/CandidateResultPdf";
import { renderPdfToBuffer } from "@/features/reports/services/renderPdf";
import { generateVerificationQrDataUrl } from "@/features/verification/services/qr";
import {
  hashReportPayload,
  publicMetaFromCandidate,
  publicMetaFromSummary,
  type CanonicalReport,
} from "@/features/verification/services/reportHash";
import {
  assertCanManageExam,
  assertPermission,
  requireStaffSession,
} from "@/server/examAccess";
import { requireRole } from "@/server/session";
import { getReportExamSummary } from "@/server/reportData";

type DocumentView = Omit<
  ComponentProps<typeof CandidateResultDocument>,
  "date" | "verification"
>;
const reportIdSchema = z.string().trim().min(1).max(64);
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

const candidateReport = async (attemptId: string, ownUserId?: string) => {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, ...(ownUserId ? { userId: ownUserId } : {}) },
    select: {
      id: true,
      examId: true,
      totalScore: true,
      maxScore: true,
      status: true,
      submittedAt: true,
      gradedAt: true,
      exam: {
        select: {
          title: true,
          resultsPublishedAt: true,
          resultReveal: true,
          passMarkPercent: true,
        },
      },
      user: { select: { name: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          order: true,
          points: true,
          answers: { select: { score: true, feedback: true } },
        },
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
    throw new Error("This result report is unavailable");
  const percentage =
    attempt.maxScore > 0
      ? Math.round((attempt.totalScore / attempt.maxScore) * 1000) / 10
      : 0;
  const outcome =
    attempt.exam.passMarkPercent === null || attempt.maxScore <= 0
      ? "Graded"
      : attempt.totalScore * 100 >=
          attempt.exam.passMarkPercent * attempt.maxScore
        ? "Passed"
        : "Below pass mark";
  const view: DocumentView = {
    title: "Candidate result report",
    examTitle: attempt.exam.title,
    rows: [
      { label: "Candidate", value: attempt.user.name },
      {
        label: "Score",
        value: `${formatScore(attempt.totalScore)} / ${attempt.maxScore} (${percentage}%)`,
      },
      { label: "Result", value: outcome },
      {
        label: "Submitted",
        value: attempt.submittedAt
          ? formatDisplayDateTime(attempt.submittedAt)
          : "Unavailable",
      },
      {
        label: "Graded",
        value: attempt.gradedAt
          ? formatDisplayDateTime(attempt.gradedAt)
          : "Unavailable",
      },
      {
        label: "Results released",
        value: formatDisplayDateTime(attempt.exam.resultsPublishedAt),
      },
      { label: "Questions", value: String(attempt.questions.length) },
    ],
    sections:
      attempt.exam.resultReveal === "score_and_answers"
        ? [
            {
              title: "Question marks",
              rows: attempt.questions.map((question, index) => ({
                label: `Question ${index + 1}`,
                value: `${formatScore(question.answers[0]?.score ?? null)} / ${question.points}${question.answers[0]?.feedback?.trim() ? `\n${question.answers[0].feedback.trim()}` : ""}`,
              })),
            },
          ]
        : [],
  };
  const payload = {
    type: "candidate_result" as const,
    examId: attempt.examId,
    attemptId: attempt.id,
    examTitle: attempt.exam.title,
    totalScore: attempt.totalScore,
    maxScore: attempt.maxScore,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  };
  return { payload, view, date: attempt.exam.resultsPublishedAt };
};

const publish = async (input: {
  view: DocumentView;
  publisher: string;
  examId: string;
  attemptId?: string;
  payload: (date: Date) => CanonicalReport;
}) => {
  const { view, publisher, examId, attemptId } = input;
  const scope = {
    type: input.payload(new Date()).type,
    examId,
    attemptId: attemptId ?? null,
  };
  const documentVersion = digest(
    JSON.stringify({ version: 1, origin: serverEnv.BETTER_AUTH_URL, view }),
  );
  const render = async (id: string, date: Date) => {
    const url = new URL(`/verify/${id}`, serverEnv.BETTER_AUTH_URL).href;
    const qr = await generateVerificationQrDataUrl(url);
    const document = createElement(CandidateResultDocument, {
      ...view,
      date,
      rows: [
        ...view.rows,
        { label: "Report issued", value: formatDisplayDateTime(date) },
      ],
      verification: { id, url, qr },
    });
    const bytes = await renderPdfToBuffer(document);
    return {
      reportId: id,
      verifyUrl: url,
      qrDataUrl: qr,
      pdfBase64: bytes.toString("base64"),
      pdfHash: digest(bytes),
    };
  };

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`report:${scope.type}:${attemptId ?? examId}`}, 0))`;
      const existing = await tx.reportVerification.findFirst({
        where: { ...scope, revokedAt: null },
        orderBy: { publishedAt: "desc" },
      });
      const date =
        existing?.documentVersion === documentVersion
          ? existing.publishedAt
          : new Date();
      const payload = input.payload(date);
      const contentHash = hashReportPayload(payload);
      if (
        existing?.documentVersion === documentVersion &&
        existing.contentHash === contentHash
      ) {
        const rendered = await render(existing.id, date);
        if (existing.pdfHash === rendered.pdfHash) return rendered;
        throw new Error("The issued PDF could not be reproduced");
      }
      const publishedAt = new Date();
      const fresh = input.payload(publishedAt);
      const { pdfHash, ...rendered } = await render(randomUUID(), publishedAt);
      if (existing) {
        await tx.reportVerification.updateMany({
          where: { ...scope, revokedAt: null },
          data: { revokedAt: publishedAt },
        });
      }
      await tx.reportVerification.create({
        data: {
          ...scope,
          id: rendered.reportId,
          publishedById: publisher,
          publishedAt,
          contentHash: hashReportPayload(fresh),
          pdfHash,
          documentVersion,
          publicMeta:
            fresh.type === "candidate_result"
              ? publicMetaFromCandidate(fresh, publishedAt)
              : publicMetaFromSummary(fresh, publishedAt),
        },
      });
      return rendered;
    },
    { timeout: 15_000 },
  );
  const { reportId, verifyUrl, pdfBase64 } = result;
  return { reportId, verifyUrl, pdfBase64 };
};

export const publishCandidateResultReport = async (rawAttemptId: unknown) => {
  const session = await requireStaffSession("admin", "examiner");
  await assertPermission(session, { result: ["publish", "export"] });
  const attemptId = reportIdSchema.parse(rawAttemptId);
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { examId: true },
  });
  if (!attempt) throw new Error("This result report is unavailable");
  await assertCanManageExam(attempt.examId, session);
  const { payload, view } = await candidateReport(attemptId);
  return publish({
    view,
    publisher: session.user.id,
    examId: attempt.examId,
    attemptId,
    payload: () => payload,
  });
};

export const downloadOwnResultReport = async (rawAttemptId: unknown) => {
  const session = await requireRole("student");
  const { view, date } = await candidateReport(
    reportIdSchema.parse(rawAttemptId),
    session.user.id,
  );
  const bytes = await renderPdfToBuffer(
    createElement(CandidateResultDocument, { ...view, date }),
  );
  return { pdfBase64: bytes.toString("base64") };
};

export const downloadQuestionPerformanceReport = async (rawExamId: unknown) => {
  const session = await requireStaffSession("admin", "examiner");
  await assertPermission(session, { result: ["read", "export"] });
  const exam = await assertCanManageExam(
    reportIdSchema.parse(rawExamId),
    session,
  );
  const analytics = await getExamAnalytics(exam.id);
  const bytes = await renderPdfToBuffer(
    createElement(CandidateResultDocument, {
      title: "Question performance report",
      examTitle: exam.title,
      date: new Date(),
      rows: [
        {
          label: "Submitted attempts",
          value: String(analytics.sample.submitted),
        },
        {
          label: "Attempts analyzed",
          value: String(analytics.sample.included),
        },
        { label: "Mean exam score", value: formatScore(analytics.scores.mean) },
      ],
      sections: analytics.questions.length
        ? [
            {
              title: "Question statistics",
              rows: analytics.questions.map((question) => ({
                label: `Question ${question.number}`,
                value: `${question.text}\n${question.answered} answered, ${question.skipped} skipped. Mean ${formatScore(question.averageScore)} / ${question.points}. Correct rate ${question.correctRate === null ? "Unavailable" : `${question.correctRate}%`}. Discrimination ${formatScore(question.discrimination)}.`,
              })),
            },
          ]
        : [],
    }),
  );
  return { pdfBase64: bytes.toString("base64") };
};

export const publishExamSummaryReport = async (rawExamId: unknown) => {
  const session = await requireStaffSession("admin", "examiner");
  await assertPermission(session, { result: ["publish", "export"] });
  const exam = await assertCanManageExam(
    reportIdSchema.parse(rawExamId),
    session,
  );
  if (!exam.resultsPublishedAt)
    throw new Error("Publish the results before issuing a summary");
  const summary = await getReportExamSummary(exam.id);
  const averagePercentage =
    summary.averageScore === null || !exam.totalMarks
      ? null
      : Math.round((summary.averageScore / exam.totalMarks) * 1000) / 10;
  return publish({
    view: {
      title: "Examination summary report",
      examTitle: exam.title,
      rows: [
        { label: "Status", value: exam.status },
        { label: "Questions", value: String(summary.questions) },
        { label: "Submitted attempts", value: String(summary.finished) },
        { label: "Graded attempts", value: String(summary.graded) },
        {
          label: "Average score",
          value:
            summary.averageScore === null
              ? "Unavailable"
              : `${summary.averageScore} / ${exam.totalMarks} (${averagePercentage ?? 0}%)`,
        },
        {
          label: "Results released",
          value: formatDisplayDateTime(exam.resultsPublishedAt),
        },
      ],
    },
    publisher: session.user.id,
    examId: exam.id,
    payload: (date) => ({
      type: "exam_summary",
      examId: exam.id,
      examTitle: exam.title,
      attemptCount: summary.finished,
      averageScore: summary.averageScore,
      publishedAt: date.toISOString(),
    }),
  });
};
