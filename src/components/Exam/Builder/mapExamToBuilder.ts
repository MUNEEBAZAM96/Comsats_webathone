import type { ExamBuilderExam } from "./ExamBuilder";

type ExamSource = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  duration: number;
  startTime: Date | string | null;
  endTime: Date | string | null;
  status: string;
  totalMarks?: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultReveal: string;
  passMarkPercent: number | null;
  blueprintJson?: string | null;
  createdBy?: { name: string } | null;
  questions: ExamBuilderExam["questions"];
  sections?: ExamBuilderExam["sections"];
};

export const mapExamToBuilder = (exam: ExamSource): ExamBuilderExam => ({
  id: exam.id,
  title: exam.title,
  description: exam.description,
  instructions: exam.instructions,
  duration: exam.duration,
  startTime: exam.startTime,
  endTime: exam.endTime,
  status: exam.status,
  totalMarks: exam.totalMarks ?? 0,
  shuffleQuestions: exam.shuffleQuestions,
  shuffleOptions: exam.shuffleOptions,
  resultReveal: exam.resultReveal,
  passMarkPercent: exam.passMarkPercent,
  blueprintJson: exam.blueprintJson ?? null,
  createdBy: exam.createdBy,
  questions: exam.questions,
  sections: exam.sections ?? [],
});
