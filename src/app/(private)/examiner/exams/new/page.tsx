import type { Metadata } from "next";
import { Suspense } from "react";
import ExamForm from "@/components/Exam/ExamForm";
import { createExam } from "@/server/examActions";
import { requireRole } from "@/server/session";
import { RouteLoading } from "@/components/Loading/RouteLoading";

export const metadata: Metadata = {
  title: "Create Exam",
  description: "Create a new exam",
};

const ExaminerCreateExamPage = () => (
  <Suspense fallback={<RouteLoading variant="workspace" />}>
    <ExaminerCreateExamContent />
  </Suspense>
);

const ExaminerCreateExamContent = async () => {
  await requireRole("examiner");

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-medium">Create exam</h1>
        <p className="text-muted-foreground text-sm">
          Save the basics first. You will continue in the exam builder to add
          questions, configure settings, and publish.
        </p>
      </div>
      <ExamForm
        action={createExam}
        submitLabel="Create draft and continue"
      />
    </section>
  );
};

export default ExaminerCreateExamPage;
