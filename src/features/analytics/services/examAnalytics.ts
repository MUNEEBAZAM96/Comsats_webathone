import "server-only";

import prisma from "@/lib/database/dbClient";
import { isManualQuestion } from "@/lib/exam/grading";
import {
  computeExamAnalytics,
  type AnalyticsAnswer,
} from "./computeExamAnalytics";

const ATTEMPT_LIMIT = 1000;
const ANSWER_BUDGET = 50_000;

export const getExamAnalytics = async (examId: string) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { title: true, passMarkPercent: true },
  });
  if (!exam) throw new Error("Exam not found");
  const finished = { examId, status: { not: "in_progress" } };
  const [assigned, started, submitted, pendingGrading, questions, incidents] =
    await Promise.all([
      prisma.examAssignment.count({ where: { examId } }),
      prisma.examAttempt.count({ where: { examId } }),
      prisma.examAttempt.count({ where: finished }),
      prisma.examAttempt.count({ where: { ...finished, totalScore: null } }),
      prisma.question.findMany({
        where: { examId },
        select: {
          id: true,
          order: true,
          text: true,
          type: true,
          options: true,
          points: true,
          difficulty: true,
          topicName: true,
          subjectName: true,
          markingScheme: true,
        },
      }),
      prisma.examIncident.groupBy({
        where: { examId },
        by: ["category", "severity"],
        _count: { _all: true },
      }),
    ]);

  const take = Math.min(
    ATTEMPT_LIMIT,
    Math.max(1, Math.floor(ANSWER_BUDGET / Math.max(1, questions.length))),
  );
  const attempts = await prisma.examAttempt.findMany({
    where: finished,
    orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take,
    select: {
      id: true,
      totalScore: true,
      maxScore: true,
      startedAt: true,
      submittedAt: true,
      submitSource: true,
    },
  });
  const answers = attempts.length
    ? await prisma.$queryRaw<AnalyticsAnswer[]>`
    SELECT s."attemptId", s."sourceQuestionId" AS "questionId", s."points",
      s."difficulty" AS "authoredDifficulty", s."topicName", s."subjectName",
      a."score", a."manualScore",
      CASE
        WHEN s."type" IN ('single_choice', 'multiple_choice', 'true_false') THEN LEFT(a."text", 12000)
        WHEN LENGTH(BTRIM(a."text", E' \t\r\n')) > 0 THEN 'answered'
        ELSE NULL
      END AS "text"
    FROM "attempt_question" s
    LEFT JOIN "answer" a ON a."attemptId" = s."attemptId" AND a."questionId" = s."sourceQuestionId"
    WHERE s."attemptId" = ANY(${attempts.map(({ id }) => id)}::text[])
  `
    : [];

  return {
    examTitle: exam.title,
    sample: { included: attempts.length, submitted },
    ...computeExamAnalytics({
      passMarkPercent: exam.passMarkPercent,
      assigned,
      started,
      submitted,
      pendingGrading,
      attempts,
      questions: questions.map((q) => ({
        id: q.id,
        number: q.order + 1,
        text: q.text,
        type: q.type,
        points: q.points,
        options: q.options,
        manual: isManualQuestion({ ...q, answer: null }),
        authoredDifficulty: q.difficulty,
        topicName: q.topicName,
        subjectName: q.subjectName,
      })),
      answers,
      incidents: incidents.map(({ category, severity, _count }) => ({
        category,
        severity,
        count: _count._all,
      })),
    }),
  };
};

export type LoadedExamAnalytics = Awaited<ReturnType<typeof getExamAnalytics>>;
