"use server";

import {
  addWeeks,
  endOfWeek,
  format,
  isWithinInterval,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import {
  isManualQuestion,
  roundScore,
  scorePercent,
} from "@/lib/exam/grading";

const getStudentSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "student") redirect("/");
  return session;
};

const isPublishedVisible = (exam: {
  resultsPublishedAt: Date | null;
  resultReveal: string;
}) =>
  Boolean(exam.resultsPublishedAt) && exam.resultReveal !== "none";

const weekBounds = (anchor: Date) => {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  return { start, end };
};

type PublishedAttemptRow = {
  id: string;
  submittedAt: Date | null;
  totalScore: number | null;
  maxScore: number;
  autoScore: number | null;
  manualScore: number | null;
  startedAt: Date;
  exam: { title: string; resultReveal: string; resultsPublishedAt: Date | null };
  answers: Array<{
    text: string | null;
    score: number | null;
    requiresManual: boolean;
    gradingSource: string | null;
    feedback: string | null;
    aiFeedback: string | null;
    attemptQuestion: {
      type: string;
      points: number;
      topicName: string | null;
      subjectName: string | null;
      answer: string | null;
      markingScheme: string | null;
    } | null;
  }>;
};

const loadPublishedAttempts = async (userId: string) => {
  const rows = await prisma.examAttempt.findMany({
    where: {
      userId,
      status: { in: ["submitted", "graded"] },
      exam: {
        resultsPublishedAt: { not: null },
        resultReveal: { not: "none" },
      },
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      submittedAt: true,
      totalScore: true,
      maxScore: true,
      autoScore: true,
      manualScore: true,
      startedAt: true,
      exam: {
        select: {
          title: true,
          resultReveal: true,
          resultsPublishedAt: true,
        },
      },
      answers: {
        select: {
          text: true,
          score: true,
          requiresManual: true,
          gradingSource: true,
          feedback: true,
          aiFeedback: true,
          attemptQuestion: {
            select: {
              type: true,
              points: true,
              topicName: true,
              subjectName: true,
              answer: true,
              markingScheme: true,
            },
          },
        },
      },
    },
  });
  return rows.filter((row) => isPublishedVisible(row.exam)) as PublishedAttemptRow[];
};

const parseAiThemes = (raw: string | null) => {
  if (!raw) return { strengths: [] as string[], improvements: [] as string[] };
  try {
    const parsed = JSON.parse(raw) as {
      strengths?: string[];
      improvements?: string[];
    };
    return {
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
    };
  } catch {
    return { strengths: [], improvements: [] };
  }
};

export const getStudentPerformanceDashboard = async () => {
  const session = await getStudentSession();
  const attempts = await loadPublishedAttempts(session.user.id);

  const scored = attempts.filter((a) => a.totalScore != null && a.maxScore > 0);
  const percents = scored.map(
    (a) => scorePercent(a.totalScore, a.maxScore) ?? 0,
  );
  const average =
    percents.length === 0 ? null : (
      roundScore(percents.reduce((s, p) => s + p, 0) / percents.length)
    );
  const best = percents.length === 0 ? null : Math.max(...percents);

  let objectiveCorrect = 0;
  let objectiveTotal = 0;
  let writtenScoreSum = 0;
  let writtenMaxSum = 0;
  let answered = 0;
  let skipped = 0;
  const topicMap = new Map<string, { score: number; max: number; n: number }>();
  const typeMap = new Map<string, { score: number; max: number; n: number }>();

  for (const attempt of scored) {
    for (const answer of attempt.answers) {
      const snap = answer.attemptQuestion;
      if (!snap) continue;
      const hasText = Boolean(answer.text?.trim());
      if (hasText) answered += 1;
      else skipped += 1;

      const manual = isManualQuestion({
        type: snap.type,
        answer: snap.answer,
        points: snap.points,
        markingScheme: snap.markingScheme,
      });
      const score = answer.score ?? 0;
      if (manual) {
        writtenScoreSum += score;
        writtenMaxSum += snap.points;
      } else {
        objectiveTotal += 1;
        if (score >= snap.points) objectiveCorrect += 1;
      }

      const topic = snap.topicName?.trim() || snap.subjectName?.trim() || "General";
      const t = topicMap.get(topic) ?? { score: 0, max: 0, n: 0 };
      t.score += score;
      t.max += snap.points;
      t.n += 1;
      topicMap.set(topic, t);

      const ty = typeMap.get(snap.type) ?? { score: 0, max: 0, n: 0 };
      ty.score += score;
      ty.max += snap.points;
      ty.n += 1;
      typeMap.set(snap.type, ty);
    }
  }

  const topics = [...topicMap.entries()]
    .map(([name, v]) => ({
      name,
      average: v.max > 0 ? Math.round((v.score / v.max) * 100) : 0,
      questions: v.n,
    }))
    .sort((a, b) => b.average - a.average);

  const types = [...typeMap.entries()]
    .map(([name, v]) => ({
      name,
      average: v.max > 0 ? Math.round((v.score / v.max) * 100) : 0,
      questions: v.n,
    }))
    .sort((a, b) => b.average - a.average);

  const recent = scored.slice(0, 8).map((a) => ({
    id: a.id,
    examTitle: a.exam.title,
    submittedAt: a.submittedAt,
    percent: scorePercent(a.totalScore, a.maxScore),
    totalScore: a.totalScore,
    maxScore: a.maxScore,
  }));

  const pending = await prisma.examAttempt.count({
    where: {
      userId: session.user.id,
      status: { not: "in_progress" },
      OR: [
        { exam: { resultsPublishedAt: null } },
        { exam: { resultReveal: "none" } },
      ],
    },
  });

  const weeklyTrend: Array<{
    label: string;
    average: number | null;
    exams: number;
  }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const { start, end } = weekBounds(subWeeks(new Date(), i));
    const inWeek = scored.filter(
      (a) =>
        a.submittedAt &&
        isWithinInterval(a.submittedAt, { start, end }),
    );
    const weekPcts = inWeek
      .filter((a) => a.totalScore != null && a.maxScore > 0)
      .map((a) => scorePercent(a.totalScore, a.maxScore) ?? 0);
    weeklyTrend.push({
      label: format(start, "MMM d"),
      average:
        weekPcts.length === 0 ? null : (
          roundScore(weekPcts.reduce((s, p) => s + p, 0) / weekPcts.length)
        ),
      exams: inWeek.length,
    });
  }

  return {
    examsCompleted: scored.length,
    average,
    best,
    answered,
    skipped,
    objectiveAccuracy:
      objectiveTotal === 0 ? null : (
        Math.round((objectiveCorrect / objectiveTotal) * 100)
      ),
    writtenAverage:
      writtenMaxSum === 0 ? null : (
        Math.round((writtenScoreSum / writtenMaxSum) * 100)
      ),
    pendingResults: pending,
    recent,
    strongestTopics: topics.slice(0, 3),
    weakestTopics: [...topics].sort((a, b) => a.average - b.average).slice(0, 3),
    typePerformance: types,
    weeklyTrend,
  };
};

export const getStudentWeeklyReport = async (offsetWeeks = 0) => {
  const session = await getStudentSession();
  const anchor = addWeeks(new Date(), -Math.max(0, offsetWeeks));
  const { start, end } = weekBounds(anchor);
  const prev = weekBounds(subWeeks(start, 1));

  const attempts = await loadPublishedAttempts(session.user.id);
  const inWeek = (a: PublishedAttemptRow, from: Date, to: Date) =>
    a.submittedAt ?
      isWithinInterval(a.submittedAt, { start: from, end: to })
    : false;

  const current = attempts.filter((a) => inWeek(a, start, end));
  const previous = attempts.filter((a) => inWeek(a, prev.start, prev.end));

  const avg = (rows: PublishedAttemptRow[]) => {
    const pcts = rows
      .filter((r) => r.totalScore != null && r.maxScore > 0)
      .map((r) => scorePercent(r.totalScore, r.maxScore) ?? 0);
    if (pcts.length === 0) return null;
    return roundScore(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  };

  const currentAvg = avg(current);
  const previousAvg = avg(previous);
  const delta =
    currentAvg == null || previousAvg == null ? null : (
      roundScore(currentAvg - previousAvg)
    );

  let objectiveCorrect = 0;
  let objectiveTotal = 0;
  let writtenScore = 0;
  let writtenMax = 0;
  let answered = 0;
  let skipped = 0;
  let minutes = 0;
  const topicMap = new Map<string, { score: number; max: number }>();
  const typeMap = new Map<string, { score: number; max: number }>();
  const strengths: string[] = [];
  const improvements: string[] = [];

  for (const attempt of current) {
    if (attempt.submittedAt) {
      minutes += Math.max(
        0,
        Math.round(
          (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) /
            60_000,
        ),
      );
    }
    for (const answer of attempt.answers) {
      const snap = answer.attemptQuestion;
      if (!snap) continue;
      if (answer.text?.trim()) answered += 1;
      else skipped += 1;
      const score = answer.score ?? 0;
      const manual = isManualQuestion({
        type: snap.type,
        answer: snap.answer,
        points: snap.points,
        markingScheme: snap.markingScheme,
      });
      if (manual) {
        writtenScore += score;
        writtenMax += snap.points;
        const themes = parseAiThemes(answer.aiFeedback);
        strengths.push(...themes.strengths.slice(0, 2));
        improvements.push(...themes.improvements.slice(0, 2));
        if (answer.feedback) improvements.push(answer.feedback.slice(0, 120));
      } else {
        objectiveTotal += 1;
        if (score >= snap.points) objectiveCorrect += 1;
      }
      const topic = snap.topicName?.trim() || "General";
      const t = topicMap.get(topic) ?? { score: 0, max: 0 };
      t.score += score;
      t.max += snap.points;
      topicMap.set(topic, t);
      const ty = typeMap.get(snap.type) ?? { score: 0, max: 0 };
      ty.score += score;
      ty.max += snap.points;
      typeMap.set(snap.type, ty);
    }
  }

  const topics = [...topicMap.entries()]
    .map(([name, v]) => ({
      name,
      average: v.max > 0 ? Math.round((v.score / v.max) * 100) : 0,
    }))
    .sort((a, b) => b.average - a.average);

  const enough = current.length > 0;

  return {
    label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
    start: start.toISOString(),
    end: end.toISOString(),
    offsetWeeks: Math.max(0, offsetWeeks),
    enoughData: enough,
    examsCompleted: current.length,
    average: currentAvg,
    previousAverage: previousAvg,
    delta,
    objectiveAccuracy:
      objectiveTotal === 0 ? null : (
        Math.round((objectiveCorrect / objectiveTotal) * 100)
      ),
    writtenAverage:
      writtenMax === 0 ? null : Math.round((writtenScore / writtenMax) * 100),
    questionsAttempted: answered,
    questionsSkipped: skipped,
    minutesSpent: minutes,
    strongestTopic: topics[0] ?? null,
    weakestTopic:
      topics.length > 0 ?
        [...topics].sort((a, b) => a.average - b.average)[0]!
      : null,
    topics,
    types: [...typeMap.entries()].map(([name, v]) => ({
      name,
      average: v.max > 0 ? Math.round((v.score / v.max) * 100) : 0,
    })),
    recommended: topics
      .filter((t) => t.average < 70)
      .slice(0, 3)
      .map((t) => t.name),
    feedbackThemes: {
      strengths: [...new Set(strengths)].slice(0, 5),
      improvements: [...new Set(improvements)].slice(0, 5),
    },
    exams: current.map((a) => ({
      id: a.id,
      title: a.exam.title,
      submittedAt: a.submittedAt,
      percent: scorePercent(a.totalScore, a.maxScore),
    })),
  };
};
