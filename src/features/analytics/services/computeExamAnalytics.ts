import { roundScore } from "@/lib/exam/grading";
import { splitLines } from "@/lib/exam/markingScheme";

export type AnalyticsAttempt = {
  id: string;
  totalScore: number | null;
  maxScore: number;
  startedAt: Date;
  submittedAt: Date | null;
  submitSource: string | null;
};

export type AnalyticsQuestion = {
  id: string;
  number: number;
  text: string;
  type: string;
  points: number;
  options: string | null;
  manual: boolean;
};

export type AnalyticsAnswer = {
  attemptId: string;
  questionId: string;
  text: string | null;
  score: number | null;
  manualScore: number | null;
  points: number;
};

export type AnalyticsInput = {
  passMarkPercent: number | null;
  assigned: number;
  /** Attempts of any status (started the exam). */
  started: number;
  /** Finished attempts only. */
  attempts: AnalyticsAttempt[];
  questions: AnalyticsQuestion[];
  answers: AnalyticsAnswer[];
  incidents: { category: string; severity: string }[];
};

const CHOICE = new Set(["multiple_choice", "single_choice", "true_false"]);
/** Classic Kelley split for the discrimination index. */
const GROUP_FRACTION = 0.27;

const mean = (xs: number[]) =>
  xs.length === 0 ? null : xs.reduce((s, n) => s + n, 0) / xs.length;

export const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Population standard deviation. */
const stdDev = (xs: number[]) => {
  const m = mean(xs);
  if (m === null) return null;
  return Math.sqrt(xs.reduce((s, n) => s + (n - m) ** 2, 0) / xs.length);
};

const round2 = (n: number | null) => (n === null ? null : roundScore(n));
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * Exam analytics from finished attempts and their snapshot answers. Only fully
 * graded attempts (non-null total) count towards score statistics.
 */
export const computeExamAnalytics = (input: AnalyticsInput) => {
  const graded = input.attempts.filter((a) => a.totalScore !== null);
  const percents = graded.map((a) =>
    a.maxScore > 0 ? ((a.totalScore ?? 0) / a.maxScore) * 100 : 0,
  );
  const totals = graded.map((a) => a.totalScore ?? 0);

  const histogram = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? "90–100%" : `${i * 10}–${i * 10 + 9}%`,
    from: i * 10,
    count: 0,
  }));
  for (const p of percents) {
    const bin = Math.min(9, Math.max(0, Math.floor(p / 10)));
    histogram[bin]!.count++;
  }

  const passCount =
    input.passMarkPercent === null ? null : (
      percents.filter((p) => p >= (input.passMarkPercent ?? 0)).length
    );

  // Discrimination groups: top and bottom 27% of graded attempts by total.
  const ranked = [...graded].sort(
    (a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0) || a.id.localeCompare(b.id),
  );
  const groupSize =
    ranked.length >= 2 ?
      Math.max(1, Math.round(ranked.length * GROUP_FRACTION))
    : 0;
  const upper = new Set(ranked.slice(0, groupSize).map((a) => a.id));
  const lower = new Set(ranked.slice(ranked.length - groupSize).map((a) => a.id));
  const finishedIds = new Set(input.attempts.map((a) => a.id));

  const answersByQuestion = new Map<string, AnalyticsAnswer[]>();
  for (const a of input.answers) {
    if (!finishedIds.has(a.attemptId)) continue;
    const list = answersByQuestion.get(a.questionId) ?? [];
    list.push(a);
    answersByQuestion.set(a.questionId, list);
  }

  const groupP = (answers: AnalyticsAnswer[], group: Set<string>, points: number) => {
    if (group.size === 0 || points <= 0) return null;
    const byAttempt = new Map(answers.map((a) => [a.attemptId, a]));
    const ratios = [...group].map((id) => (byAttempt.get(id)?.score ?? 0) / points);
    return mean(ratios);
  };

  const questions = [...input.questions]
    .sort((a, b) => a.number - b.number)
    .map((q) => {
      const answers = answersByQuestion.get(q.id) ?? [];
      const responses = answers.length;
      const blank = answers.filter((a) => !a.text?.trim()).length;
      const scored = answers.filter((a) => a.score !== null);
      const p =
        q.points > 0 ? mean(scored.map((a) => (a.score ?? 0) / q.points)) : null;
      const pUpper = groupP(answers, upper, q.points);
      const pLower = groupP(answers, lower, q.points);

      const optionFrequency =
        CHOICE.has(q.type) ?
          (q.type === "true_false" && splitLines(q.options).length !== 2 ?
            ["True", "False"]
          : splitLines(q.options)
          ).map((option) => {
            const count = answers.filter((a) => splitLines(a.text).includes(option)).length;
            return { option, count, pct: pct(count, responses) ?? 0 };
          })
        : [];

      const manualMarks = answers
        .map((a) => a.manualScore)
        .filter((s): s is number => s !== null);

      return {
        id: q.id,
        number: q.number,
        text: q.text,
        type: q.type,
        points: q.points,
        responses,
        blankPct: pct(blank, responses) ?? 0,
        difficulty: round2(p),
        discrimination: pUpper === null || pLower === null ? null : round2(pUpper - pLower),
        optionFrequency,
        averageManualScore: q.manual ? round2(mean(manualMarks)) : null,
      };
    });

  const minutes = input.attempts
    .filter((a) => a.submittedAt)
    .map((a) => ((a.submittedAt?.getTime() ?? 0) - a.startedAt.getTime()) / 60_000);
  const bySubmitSource: Record<string, number> = {};
  for (const a of input.attempts) {
    const key = a.submitSource ?? "manual";
    bySubmitSource[key] = (bySubmitSource[key] ?? 0) + 1;
  }

  const countBy = (key: "category" | "severity") => {
    const out: Record<string, number> = {};
    for (const i of input.incidents) out[i[key]] = (out[i[key]] ?? 0) + 1;
    return out;
  };

  const submitted = input.attempts.length;
  return {
    empty: submitted === 0,
    participation: {
      assigned: input.assigned,
      started: input.started,
      submitted,
      notStarted: Math.max(0, input.assigned - input.started),
      completionRate: pct(submitted, input.assigned),
      pendingGrading: submitted - graded.length,
    },
    scores: {
      graded: graded.length,
      maxScore: graded[0]?.maxScore ?? input.attempts[0]?.maxScore ?? 0,
      mean: round2(mean(totals)),
      median: round2(median(totals)),
      min: totals.length ? round2(Math.min(...totals)) : null,
      max: totals.length ? round2(Math.max(...totals)) : null,
      stdDev: round2(stdDev(totals)),
      meanPercent: round2(mean(percents)),
      passMarkPercent: input.passMarkPercent,
      passCount,
      passRate: passCount === null ? null : pct(passCount, graded.length),
      histogram,
    },
    questions,
    time: {
      medianMinutes: round2(median(minutes)),
      bySubmitSource,
    },
    integrity: {
      total: input.incidents.length,
      byCategory: countBy("category"),
      bySeverity: countBy("severity"),
    },
  };
};

export type ExamAnalytics = ReturnType<typeof computeExamAnalytics>;
