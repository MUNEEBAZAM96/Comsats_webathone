import type { Metadata } from "next";
import { requireRole } from "@/server/session";
import { getStudentWeeklyReport } from "@/server/studentAnalytics";
import { WeeklyReportView } from "@/components/Student/WeeklyReportView";

export const metadata: Metadata = {
  title: "Weekly Report",
  description: "Your weekly exam performance report",
};

export const instant = false;

const StudentWeeklyReportPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) => {
  await requireRole("student");
  const params = await searchParams;
  const week = Number.parseInt(params.week ?? "0", 10);
  const offset = Number.isFinite(week) && week > 0 ? week : 0;
  const report = await getStudentWeeklyReport(offset);

  return <WeeklyReportView report={report} />;
};

export default StudentWeeklyReportPage;
