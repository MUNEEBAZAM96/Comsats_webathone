import type { Metadata } from "next";
import { MonitorPage } from "@/components/Monitoring/MonitorPage";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Monitor Exam",
  description: "Live monitoring, incidents and announcements",
};

const AdminMonitorExamPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const session = await requireRole("admin");
  const { id } = await params;
  return (
    <MonitorPage
      examId={id}
      viewerId={session.user.id}
      backHref={`/admin/exams/${id}`}
      links={[
        { href: `/admin/exams/${id}/grading`, label: "Grading" },
        { href: `/admin/exams/${id}/results`, label: "Results" },
      ]}
    />
  );
};

export default AdminMonitorExamPage;
