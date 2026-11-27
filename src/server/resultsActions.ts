"use server";

import "server-only";
import { redirect } from "next/navigation";
import prisma from "@/lib/database/dbClient";
import { isManualQuestion, scorePercent } from "@/lib/exam/grading";
import { getEffectiveExamStatus } from "@/lib/exam/lifecycle";
import { finalizeExpiredAttempts } from "@/server/attemptSweep";
import {
  AccessError,
  assertCanMonitorExam,
  assertPermission,
  getStaffSession,
  staffBasePath,
  type StaffSession,
} from "@/server/examAccess";

/** Staff with `result:read`; anyone else is sent home. */
const resultsSession = async (): Promise<StaffSession> => {
  const session = await getStaffSession();
  if (!session) redirect("/");
  try {
    await assertPermission(session, { result: ["read"] });
  } catch {
    redirect("/");
  }
  return session;
};

const isManager = (session: StaffSession, createdById: string) =>
  session.user.role === "admin" ||
  (session.user.role === "examiner" && createdById === session.user.id);

const resultsHome = (session: StaffSession) =>
  `${staffBasePath(session.user.role)}/results` as const;

const monitorOrRedirect = async (examId: string, session: StaffSession) => {
  try {
    return await assertCanMonitorExam(examId, session);
  } catch (e) {
    if (e instanceof AccessError) redirect(resultsHome(session));
    throw e;
  }
};

const pendingByAttempt = async (attemptIds: string[]) => {
  if (attemptIds.length === 0) return new Map<string, number>();
  const rows = await prisma.answer.groupBy({
    by: ["attemptId"],
    where: {
      attemptId: { in: attemptIds },
      requiresManual: true,
      manualScore: null,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.attemptId, r._count._all]));
};

/** Every finished attempt of one exam with score breakdown. */
export const getExamResults = async (examId: string) => {
  const session = await resultsSession();
  const exam = await monitorOrRedirect(examId, session);
  await finalizeExpiredAttempts(exam.id);

  const [attempts, questionCount, inProgress] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { examId: exam.id, status: { not: "in_progress" } },
      select: {
        id: true,
        status: true,
        autoScore: true,
        manualScore: true,
        totalScore: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        gradedAt: true,
        submitSource: true,
        user: { select: { id: true, name: true, email: true } },
        _count: {
          select: { answers: { where: { NOT: [{ text: null }, { text: "" }] } } },
        },
      },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.question.count({ where: { examId: exam.id } }),
    prisma.examAttempt.count({ where: { examId: exam.id, status: "in_progress" } }),
  ]);
  const pending = await pendingByAttempt(attempts.map((a) => a.id));

  return {
    examId: exam.id,
    examTitle: exam.title,
    effectiveStatus: getEffectiveExamStatus(exam),
    resultsPublishedAt: exam.resultsPublishedAt,
    resultReveal: exam.resultReveal,
    passMarkPercent: exam.passMarkPercent,
    totalMarks: exam.totalMarks,
    canManage: isManager(session, exam.createdById),
    questionCount,
    inProgress,
    pendingManual: [...pending.values()].reduce((s, n) => s + n, 0),
    attempts: attempts.map((a) => ({
      id: a.id,
      student: a.user,
      status: a.status,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      percentage: scorePercent(a.totalScore, a.maxScore),
      pendingManual: pending.get(a.id) ?? 0,
      submitSource: a.submitSource,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      gradedAt: a.gradedAt,
      answerCount: a._count.answers,
      questionCount,
    })),
  };
};

export type ExamResults = Awaited<ReturnType<typeof getExamResults>>;

/** Finished attempts across every exam the viewer may read. */
export const getAllResults = async () => {
  const session = await resultsSession();
  const { id: userId, role } = session.user;

  const examFilter =
    role === "examiner" ? { exam: { createdById: userId } }
    : role === "proctor" ? { exam: { proctors: { some: { proctorId: userId } } } }
    : {};

  const attempts = await prisma.examAttempt.findMany({
    where: { status: { not: "in_progress" }, ...examFilter },
    select: {
      id: true,
      status: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      maxScore: true,
      submittedAt: true,
      exam: { select: { id: true, title: true, resultsPublishedAt: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return attempts.map((a) => ({
    id: a.id,
    exam: a.exam,
    student: a.user,
    status: a.status,
    autoScore: a.autoScore,
    manualScore: a.manualScore,
    totalScore: a.totalScore,
    maxScore: a.maxScore,
    percentage: scorePercent(a.totalScore, a.maxScore),
    submittedAt: a.submittedAt,
  }));
};

/**
 * Staff view of one finished attempt from its snapshots: prompt, key, the
 * candidate's answer, auto/manual/final score, feedback and audits.
 */
export const getResultDetail = async (attemptId: string) => {
  const session = await resultsSession();
  if (typeof attemptId !== "string" || !attemptId || attemptId.length > 64)
    redirect(resultsHome(session));

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      examId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      submitSource: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      maxScore: true,
      gradedAt: true,
      user: { select: { id: true, name: true, email: true } },
      questions: { orderBy: { order: "asc" } },
      answers: {
        select: {
          id: true,
          questionId: true,
          text: true,
          score: true,
          autoScore: true,
          manualScore: true,
          feedback: true,
          requiresManual: true,
          gradedAt: true,
          gradedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!attempt) redirect(resultsHome(session));
  const exam = await monitorOrRedirect(attempt.examId, session);

  // Answer keys are never shown for an attempt that is still being written.
  if (attempt.status === "in_progress") redirect(resultsHome(session));
  if (attempt.questions.length === 0)
    throw new Error("Exam question snapshots are missing for this attempt");

  const canManage = isManager(session, exam.createdById);
  const audits =
    canManage ?
      await prisma.gradeAudit.findMany({
        where: { answer: { attemptId: attempt.id } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          answerId: true,
          action: true,
          previousScore: true,
          newScore: true,
          reason: true,
          createdAt: true,
          gradedBy: { select: { name: true } },
        },
      })
    : [];

  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    submitSource: attempt.submitSource,
    autoScore: attempt.autoScore,
    manualScore: attempt.manualScore,
    totalScore: attempt.totalScore,
    maxScore: attempt.maxScore,
    gradedAt: attempt.gradedAt,
    user: attempt.user,
    exam: {
      id: exam.id,
      title: exam.title,
      resultsPublishedAt: exam.resultsPublishedAt,
      resultReveal: exam.resultReveal,
      passMarkPercent: exam.passMarkPercent,
    },
    canManage,
    questions: attempt.questions.map((s) => ({
      id: s.sourceQuestionId,
      text: s.text,
      type: s.type,
      options: s.optionOrder ?? s.options,
      answer: s.answer,
      manual: isManualQuestion({
        type: s.type,
        answer: s.answer,
        points: s.points,
        markingScheme: s.markingScheme,
      }),
      points: s.points,
      order: s.order,
      difficulty: s.difficulty,
      // Raw marking schemes are for the exam's managers only.
      ...(canManage ? { markingScheme: s.markingScheme } : {}),
    })),
    answers: attempt.answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      text: a.text,
      score: a.score,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      feedback: a.feedback,
      requiresManual: a.requiresManual,
      manuallyGraded: a.manualScore != null,
      gradedAt: a.gradedAt,
      gradedBy: a.gradedBy?.name ?? null,
    })),
    audits: audits.map((a) => ({
      id: a.id,
      answerId: a.answerId,
      action: a.action,
      previousScore: a.previousScore,
      newScore: a.newScore,
      reason: a.reason,
      createdAt: a.createdAt,
      by: a.gradedBy.name,
    })),
  };
};

export type StaffResultDetail = Awaited<ReturnType<typeof getResultDetail>>;
