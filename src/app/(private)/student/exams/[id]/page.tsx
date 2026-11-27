import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/session";
import { startExam, getAttemptQuestions } from "@/server/studentExamActions";
import { ExamPlayer } from "@/components/Student/ExamPlayer";

export const metadata: Metadata = {
  title: "Take Exam",
  description: "Take exam",
};

const Unavailable = ({ title, message }: { title: string; message: string }) => (
  <section className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-12">
    <h1 className="text-2xl font-medium">{title}</h1>
    <p className="text-muted-foreground">{message}</p>
    <div>
      <Link
        href="/student/exams"
        className="text-primary text-sm hover:underline">
        ← Back to My Exams
      </Link>
    </div>
  </section>
);

const StudentTakeExamPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRole("student");
  const { id } = await params;

  let attempt: Awaited<ReturnType<typeof startExam>>;
  try {
    attempt = await startExam(id);
  } catch (e) {
    return (
      <Unavailable
        title="Exam unavailable"
        message={e instanceof Error ? e.message : "This exam is not available"}
      />
    );
  }

  if (!attempt)
    return (
      <Unavailable
        title="Exam not found"
        message="Could not start this exam. Please try again."
      />
    );

  if (attempt.status !== "in_progress")
    redirect(`/student/results/${attempt.id}` as Route);

  const data = await getAttemptQuestions(attempt.id);

  if (data.attempt.status !== "in_progress")
    redirect(`/student/results/${attempt.id}` as Route);

  return (
    <ExamPlayer
      attemptId={data.attempt.id}
      examTitle={data.attempt.exam.title}
      instructions={data.attempt.exam.instructions}
      initialRemainingMs={data.clock.remainingMs}
      questions={data.questions}
      savedAnswers={data.answers}
    />
  );
};

export default StudentTakeExamPage;
