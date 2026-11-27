import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { EyeIcon } from "lucide-react";
import { requireRole } from "@/server/session";
import { getStudentResults } from "@/server/studentExamActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { Button } from "@/components/shadcnui/button";
import { PctBadge } from "@/components/Results/PctBadge";
import { formatScore, scorePercent } from "@/lib/exam/grading";

export const metadata: Metadata = {
  title: "My Results",
  description: "View your exam results and scores",
};

const ResultState = ({
  published,
  visible,
}: {
  published: boolean;
  visible: boolean;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      visible ? "bg-success-surface text-success"
      : published ? "bg-muted text-muted-foreground"
      : "bg-info-surface text-info"
    }`}>
    {visible ?
      "Results released"
    : published ?
      "Score not shared"
    : "Awaiting results"}
  </span>
);

const StudentResultsPage = async () => {
  await requireRole("student");
  const results = await getStudentResults();

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-medium">My Results</h1>
      {results.length === 0 ?
        <Card>
          <CardHeader>
            <CardTitle>No results yet</CardTitle>
            <CardDescription>
              Complete an exam to see your results here.
            </CardDescription>
          </CardHeader>
        </Card>
      : <div className="grid gap-4">
          {results.map((r) => {
            const pct =
              r.resultsVisible ? scorePercent(r.totalScore, r.maxScore) : null;
            return (
              <Card key={r.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <CardTitle className="text-lg break-words">
                        {r.examTitle}
                      </CardTitle>
                      <CardDescription>by {r.examinerName}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.resultsVisible && r.totalScore != null && (
                        <span className="text-lg font-bold tabular-nums">
                          {formatScore(r.totalScore)}/{r.maxScore}
                        </span>
                      )}
                      {pct != null && <PctBadge pct={pct} />}
                      <ResultState
                        published={r.resultsPublished}
                        visible={r.resultsVisible}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-muted-foreground flex gap-4 text-sm">
                      <span>
                        {r.answeredCount}/{r.questionCount} answered
                      </span>
                      <span>
                        {r.submittedAt ?
                          format(r.submittedAt, "MMM d, yyyy")
                        : "—"}
                      </span>
                    </div>
                    <Link href={`/student/results/${r.id}` as Route}>
                      <Button
                        variant="outline"
                        size="lg">
                        <EyeIcon className="size-4" /> View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }
    </section>
  );
};

export default StudentResultsPage;
