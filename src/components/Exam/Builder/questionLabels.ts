export const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Multiple select",
  single_choice: "Single choice",
  true_false: "True / False",
  short_answer: "Short answer",
  long_answer: "Long answer",
};

export const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export type BuilderQuestion = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  answer: string | null;
  points: number;
  order: number;
  difficulty?: string | null;
  markingScheme?: string | null;
};

export type BuilderStep = "details" | "questions" | "settings" | "review";

export const BUILDER_STEPS: Array<{ id: BuilderStep; label: string; hint: string }> = [
  { id: "details", label: "Exam details", hint: "Title, description, instructions" },
  { id: "questions", label: "Question set", hint: "Import, create, reorder" },
  { id: "settings", label: "Exam settings", hint: "Schedule, shuffle, results" },
  { id: "review", label: "Review & publish", hint: "Validate and go live" },
];
