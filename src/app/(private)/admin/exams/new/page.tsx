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

const AdminCreateExamPage = () => (
  <Suspense fallback={<RouteLoading variant="workspace" />}>
    <AdminCreateExamContent />
  </Suspense>
);

const AdminCreateExamContent = async () => {
  await requireRole("admin");

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-medium">Create Exam</h1>
      <ExamForm
        action={createExam}
        submitLabel="Create Exam"
      />
    </section>
  );
};

export default AdminCreateExamPage;
