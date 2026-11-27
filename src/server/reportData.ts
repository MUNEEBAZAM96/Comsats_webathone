import "server-only";
import prisma from "@/lib/database/dbClient";

export const getReportExamSummary = async (examId: string) => {
  const [finished, graded, questions] = await Promise.all([
    prisma.examAttempt.count({
      where: { examId, status: { not: "in_progress" } },
    }),
    prisma.examAttempt.aggregate({
      where: { examId, status: "graded", totalScore: { not: null } },
      _avg: { totalScore: true },
      _count: true,
    }),
    prisma.question.count({ where: { examId } }),
  ]);
  const averageScore = graded._avg.totalScore;
  return {
    finished,
    graded: graded._count,
    questions,
    averageScore:
      averageScore === null ? null : Math.round(averageScore * 10) / 10,
  };
};
