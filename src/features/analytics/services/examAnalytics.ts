import "server-only";

import prisma from "@/lib/database/dbClient";
import { isManualQuestion } from "@/lib/exam/grading";
import { computeExamAnalytics } from "./computeExamAnalytics";

/** Load finished attempts and snapshot answers for one exam, then compute analytics. */
export const getExamAnalytics = async (examId: string) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, passMarkPercent: true },
  });
  if (!exam) throw new Error("Exam not found");

  const [assigned, started, attempts, examQuestions, answers, incidents] =
    await Promise.all([
      prisma.examAssignment.count({ where: { examId } }),
      prisma.examAttempt.count({ where: { examId } }),
      prisma.examAttempt.findMany({
        where: { examId, status: { not: "in_progress" } },
        select: {
          id: true,
          totalScore: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          submitSource: true,
        },
      }),
      prisma.question.findMany({
        where: { examId },
        select: { id: true, order: true },
      }),
      prisma.answer.findMany({
        where: {
          attempt: { examId, status: { not: "in_progress" } },
          attemptQuestionId: { not: null },
        },
        select: {
          attemptId: true,
          text: true,
          score: true,
          manualScore: true,
          attemptQuestion: {
            select: {
              sourceQuestionId: true,
              text: true,
              type: true,
              points: true,
              options: true,
              answer: true,
              markingScheme: true,
            },
          },
        },
      }),
      prisma.examIncident.findMany({
        where: { examId },
        select: { category: true, severity: true },
      }),
    ]);

  const examOrder = new Map(examQuestions.map((q) => [q.id, q.order]));
  const questions = new Map<string, Parameters<typeof computeExamAnalytics>[0]["questions"][number]>();
  for (const a of answers) {
    const s = a.attemptQuestion;
    if (!s || questions.has(s.sourceQuestionId)) continue;
    questions.set(s.sourceQuestionId, {
      id: s.sourceQuestionId,
      number: (examOrder.get(s.sourceQuestionId) ?? questions.size) + 1,
      text: s.text,
      type: s.type,
      points: s.points,
      options: s.options,
      manual: isManualQuestion(s),
    });
  }

  return {
    examTitle: exam.title,
    ...computeExamAnalytics({
      passMarkPercent: exam.passMarkPercent,
      assigned,
      started,
      attempts,
      questions: [...questions.values()],
      answers: answers.flatMap((a) =>
        a.attemptQuestion ?
          [
            {
              attemptId: a.attemptId,
              questionId: a.attemptQuestion.sourceQuestionId,
              text: a.text,
              score: a.score,
              manualScore: a.manualScore,
              points: a.attemptQuestion.points,
            },
          ]
        : [],
      ),
      incidents,
    }),
  };
};

export type LoadedExamAnalytics = Awaited<ReturnType<typeof getExamAnalytics>>;
