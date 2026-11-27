import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { requireRole } from "@/server/session";
import { getStudentPerformanceDashboard } from "@/server/studentAnalytics";
import { PerformanceSummary } from "@/components/Student/PerformanceSummary";
import { Button } from "@/components/shadcnui/button";

export const metadata: Metadata = {
  title: "Performance",
  description: "Your published exam performance overview",
};

export const instant = false;

const StudentReportsPage = async () => {
  await requireRole("student");
  const data = await getStudentPerformanceDashboard();

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-medium">Performance overview</h1>
          <p className="text-muted-foreground text-sm">
            Based on published results only. Unpublished attempts stay private.
          </p>
        </div>
        <Link href={"/student/reports/weekly" as Route}>
          <Button
            variant="outline"
            size="lg">
            Weekly report
          </Button>
        </Link>
      </div>
      <PerformanceSummary data={data} />
    </section>
  );
};

export default StudentReportsPage;
