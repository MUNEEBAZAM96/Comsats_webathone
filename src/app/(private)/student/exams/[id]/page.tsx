import { addMinutes, min } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { startExam, getAttemptQuestions } from "@/server/studentExamActions";
import { ExamPlayer } from "@/components/Student/ExamPlayer";

export const metadata: Metadata = {
  title: "Take Exam",
  description: "Take exam",
};

const StudentTakeExamPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;

  let attempt: Awaited<ReturnType<typeof startExam>>;
  try {
    attempt = await startExam(id);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "This exam is not available";
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-12">
        <h1 className="text-2xl font-medium">Exam Unavailable</h1>
        <p className="text-muted-foreground">{message}</p>
        <div>
          <Link
            href="/student/exams"
            className="text-primary text-sm hover:underline"
          >
            ← Back to My Exams
          </Link>
        </div>
      </section>
    );
  }

  if (!attempt) {
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-12">
        <h1 className="text-2xl font-medium">Exam not found</h1>
        <p className="text-muted-foreground">
          Could not start this exam. Please try again.
        </p>
        <div>
          <Link
            href="/student/exams"
            className="text-primary text-sm hover:underline"
          >
            ← Back to My Exams
          </Link>
        </div>
      </section>
    );
  }

  const data = await getAttemptQuestions(attempt.id);

  if (data.attempt.status !== "in_progress") {
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-12">
        <h1 className="text-2xl font-medium">Exam already submitted</h1>
        <p className="text-muted-foreground">
          You have already submitted this exam.
        </p>
        <div>
          <Link
            href="/student/exams"
            className="text-primary text-sm hover:underline"
          >
            ← Back to My Exams
          </Link>
        </div>
      </section>
    );
  }

  const durationDeadline = addMinutes(
    data.attempt.startedAt,
    data.attempt.exam.duration,
  );
  const deadline = data.attempt.exam.endTime
    ? min([durationDeadline, data.attempt.exam.endTime])
    : durationDeadline;

  return (
    <ExamPlayer
      attemptId={data.attempt.id}
      examTitle={data.attempt.exam?.title ?? "Exam"}
      initialRemainingMs={Math.max(0, deadline.getTime() - Date.now())}
      questions={data.questions}
      savedAnswers={data.answers}
    />
  );
};

export default StudentTakeExamPage;
