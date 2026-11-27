import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { ClockIcon, EyeOffIcon } from "lucide-react";
import { requireRole } from "@/server/session";
import { getResultDetail } from "@/server/studentExamActions";
import { ResultReview } from "@/components/Student/ResultReview";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";

export const metadata: Metadata = {
  title: "Result Details",
  description: "View result details",
};

const StudentResultDetailPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRole("student");
  const { id } = await params;
  const data = await getResultDetail(id);
  const submitted =
    data.submittedAt ?
      `Submitted ${format(data.submittedAt, "MMM d, yyyy, h:mm a")}.`
    : "Submitted.";

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-medium">{data.examTitle} — Results</h1>
        <Link
          href="/student/results"
          className="text-primary text-sm hover:underline">
          ← Back to My Results
        </Link>
      </div>

      {data.visibility === "awaiting" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon
                aria-hidden="true"
                className="text-info size-5"
              />
              {data.status === "submitted" ?
                "Being graded"
              : "Submitted — awaiting results"}
            </CardTitle>
            <CardDescription>
              {submitted} Your answers were received.{" "}
              {data.status === "submitted" ?
                "Some answers are being marked by an examiner. "
              : ""}
              Scores and feedback appear here once the examiner publishes
              results.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {data.visibility === "withheld" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <EyeOffIcon
                aria-hidden="true"
                className="text-muted-foreground size-5"
              />
              Scores are not shared for this exam
            </CardTitle>
            <CardDescription>
              {submitted} Results for this exam have been finalised, but the
              examiner has chosen not to release individual scores.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {data.visibility === "released" && (
        <ResultReview
          totalScore={data.totalScore}
          maxScore={data.maxScore}
          submittedAt={data.submittedAt?.toISOString() ?? null}
          questions={data.questions}
          answers={data.answers}
          showAnswers={data.showAnswers}
          passMarkPercent={data.passMarkPercent}
          summary={data.summary}
        />
      )}
    </section>
  );
};

export default StudentResultDetailPage;
