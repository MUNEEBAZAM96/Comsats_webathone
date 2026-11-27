import type { Metadata } from "next";
import { MonitorPage } from "@/components/Monitoring/MonitorPage";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Monitor Exam",
  description: "Live monitoring, incidents and announcements",
};

const ExaminerMonitorExamPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const session = await requireRole("examiner");
  const { id } = await params;
  return (
    <MonitorPage
      examId={id}
      viewerId={session.user.id}
      backHref={`/examiner/exams/${id}`}
      links={[
        { href: `/examiner/exams/${id}/grading`, label: "Grading" },
        { href: `/examiner/exams/${id}/results`, label: "Results" },
      ]}
    />
  );
};

export default ExaminerMonitorExamPage;
