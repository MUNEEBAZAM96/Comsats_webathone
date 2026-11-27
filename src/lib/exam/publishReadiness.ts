import { isAfter, parseISO } from "date-fns";
import { splitLines } from "@/lib/exam/markingScheme";

export type PublishIssue = {
  id: string;
  message: string;
  step: "details" | "questions" | "settings" | "review";
  questionId?: string;
};

export type PublishQuestionInput = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  answer: string | null;
  points: number;
};

export type PublishExamInput = {
  title: string;
  duration: number;
  startTime: Date | string | null | undefined;
  endTime: Date | string | null | undefined;
  passMarkPercent?: number | null;
  questions: PublishQuestionInput[];
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = parseISO(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

export const evaluatePublishReadiness = (
  exam: PublishExamInput,
): { ready: boolean; issues: PublishIssue[]; totalMarks: number } => {
  const issues: PublishIssue[] = [];

  if (!exam.title?.trim()) {
    issues.push({
      id: "title",
      message: "Add an exam title.",
      step: "details",
    });
  }

  if (!Number.isInteger(exam.duration) || exam.duration < 1) {
    issues.push({
      id: "duration",
      message: "Duration must be at least one minute.",
      step: "details",
    });
  }

  const start = toDate(exam.startTime);
  const end = toDate(exam.endTime);

  if (!start) {
    issues.push({
      id: "startTime",
      message: "This exam has no scheduled start time.",
      step: "settings",
    });
  }
  if (!end) {
    issues.push({
      id: "endTime",
      message: "This exam has no scheduled end time.",
      step: "settings",
    });
  }
  if (start && end && !isAfter(end, start)) {
    issues.push({
      id: "window",
      message: "End time must be after start time.",
      step: "settings",
    });
  }

  if (
    exam.passMarkPercent != null &&
    (exam.passMarkPercent < 0 || exam.passMarkPercent > 100)
  ) {
    issues.push({
      id: "passMark",
      message: "Pass mark must be between 0 and 100.",
      step: "settings",
    });
  }

  if (exam.questions.length < 1) {
    issues.push({
      id: "questions",
      message: "Add at least one question before publishing.",
      step: "questions",
    });
  }

  const totalMarks = exam.questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
  if (exam.questions.length > 0 && totalMarks <= 0) {
    issues.push({
      id: "totalMarks",
      message: "Total marks must be greater than zero.",
      step: "questions",
    });
  }

  for (const [index, q] of exam.questions.entries()) {
    const label = `Question ${index + 1}`;
    if (!q.text?.trim()) {
      issues.push({
        id: `q-text-${q.id}`,
        message: `${label} is missing question text.`,
        step: "questions",
        questionId: q.id,
      });
    }
    if (!Number.isFinite(q.points) || q.points <= 0) {
      issues.push({
        id: `q-points-${q.id}`,
        message: `${label} must have positive points.`,
        step: "questions",
        questionId: q.id,
      });
    }

    const needsOptions =
      q.type === "multiple_choice" ||
      q.type === "single_choice" ||
      q.type === "true_false";
    const options = splitLines(q.options);
    if (needsOptions && options.length < 2) {
      issues.push({
        id: `q-options-${q.id}`,
        message: `${label} needs at least two options.`,
        step: "questions",
        questionId: q.id,
      });
    }
    if (needsOptions && new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      issues.push({
        id: `q-dup-options-${q.id}`,
        message: `${label} has duplicate options.`,
        step: "questions",
        questionId: q.id,
      });
    }

    if (q.type === "long_answer") continue;

    const answers = splitLines(q.answer);
    if (answers.length === 0) {
      issues.push({
        id: `q-answer-${q.id}`,
        message: `${label} is missing a correct answer.`,
        step: "questions",
        questionId: q.id,
      });
      continue;
    }

    if (q.type === "single_choice" || q.type === "true_false") {
      if (answers.length !== 1) {
        issues.push({
          id: `q-single-${q.id}`,
          message: `${label} must have exactly one correct answer.`,
          step: "questions",
          questionId: q.id,
        });
      } else if (options.length && !options.includes(answers[0]!)) {
        issues.push({
          id: `q-match-${q.id}`,
          message: `${label} correct answer must match an option.`,
          step: "questions",
          questionId: q.id,
        });
      }
    }

    if (q.type === "multiple_choice") {
      if (answers.length < 1) {
        issues.push({
          id: `q-multi-${q.id}`,
          message: `${label} needs at least one correct option.`,
          step: "questions",
          questionId: q.id,
        });
      } else if (options.length && answers.some((a) => !options.includes(a))) {
        issues.push({
          id: `q-multi-match-${q.id}`,
          message: `${label} correct answers must match options.`,
          step: "questions",
          questionId: q.id,
        });
      }
    }
  }

  return { ready: issues.length === 0, issues, totalMarks };
};
