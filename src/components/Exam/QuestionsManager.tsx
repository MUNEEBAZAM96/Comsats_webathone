"use client";

import { useRouter } from "next/navigation";
import QuestionSetPanel from "@/components/Exam/Builder/QuestionSetPanel";
import type { BuilderQuestion } from "@/components/Exam/Builder/questionLabels";

type QuestionsManagerProps = {
  examId: string;
  questions: BuilderQuestion[];
  readOnly?: boolean;
};

/** @deprecated Prefer ExamBuilder; kept for any remaining call sites. */
const QuestionsManager = ({
  examId,
  questions,
  readOnly = false,
}: QuestionsManagerProps) => {
  const router = useRouter();
  return (
    <QuestionSetPanel
      examId={examId}
      questions={questions}
      readOnly={readOnly}
      onChanged={() => router.refresh()}
    />
  );
};

export default QuestionsManager;
