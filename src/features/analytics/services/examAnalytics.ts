import "server-only";

import prisma from "@/lib/database/dbClient";

const PASS_PCT = 50;

export const getExamAnalytics = async (examId: string) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, totalMarks: true },
  });
  if (!exam) throw new Error("Exam not found");

  const attempts = await prisma.examAttempt.findMany({
    where: { examId, status: { not: "in_progress" } },
    select: {
      totalScore: true,
      maxScore: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  const scores = attempts.map((a) => a.totalScore ?? 0);
  const empty = scores.length === 0;

  const average =
    empty ? 0 : Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10;
  const highest = empty ? 0 : Math.max(...scores);
  const lowest = empty ? 0 : Math.min(...scores);

  let pass = 0;
  let fail = 0;
  for (const a of attempts) {
    const pct = a.maxScore > 0 ? ((a.totalScore ?? 0) / a.maxScore) * 100 : 0;
    if (pct >= PASS_PCT) pass++;
    else fail++;
  }

  const snapshots = await prisma.attemptQuestion.findMany({
    where: { attempt: { examId, status: { not: "in_progress" } } },
    select: {
      sourceQuestionId: true,
      text: true,
      points: true,
      difficulty: true,
      answers: { select: { score: true } },
    },
  });

  const byQuestion = new Map<
    string,
    { text: string; difficulty: string; points: number; correct: number; total: number }
  >();

  for (const s of snapshots) {
    const cur = byQuestion.get(s.sourceQuestionId) ?? {
      text: s.text,
      difficulty: s.difficulty,
      points: s.points,
      correct: 0,
      total: 0,
    };
    for (const ans of s.answers) {
      cur.total += 1;
      if ((ans.score ?? 0) >= s.points) cur.correct += 1;
    }
    byQuestion.set(s.sourceQuestionId, cur);
  }

  const questionStats = [...byQuestion.entries()].map(([id, q]) => ({
    id,
    text: q.text.slice(0, 80),
    difficulty: q.difficulty,
    correctRate: q.total === 0 ? 0 : Math.round((q.correct / q.total) * 100),
  }));

  const trend = attempts.map((a, i) => ({
    index: i + 1,
    score: a.totalScore ?? 0,
    label: a.user.name.split(" ")[0] ?? `S${i + 1}`,
  }));

  return {
    examTitle: exam.title,
    attemptCount: attempts.length,
    average,
    highest,
    lowest,
    pass,
    fail,
    questionStats,
    trend,
    empty,
  };
};
