import Link from "next/link";
import type { Route } from "next";
import { ClockIcon, EyeIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import type { CandidateExamEligibility } from "@/lib/exam/eligibility";

type Props = {
  examId: string;
  attemptId: string | null;
  eligibility: CandidateExamEligibility;
};

/** The single primary action for an assigned exam, decided by server eligibility. */
export const CandidateExamAction = ({ examId, attemptId, eligibility }: Props) => {
  const { action, state } = eligibility;

  if (action === "start")
    return (
      <Link
        prefetch={false}
        href={`/student/exams/${examId}` as Route}>
        <Button size="lg">
          <PlayIcon className="size-4" /> Start
        </Button>
      </Link>
    );

  if (action === "resume")
    return (
      <Link
        prefetch={false}
        href={`/student/exams/${examId}` as Route}>
        <Button size="lg">
          <RotateCcwIcon className="size-4" />
          {state === "time_up" ? "Finalize" : "Resume"}
        </Button>
      </Link>
    );

  if (action === "view_result" && attemptId)
    return (
      <Link href={`/student/results/${attemptId}` as Route}>
        <Button
          variant="outline"
          size="lg">
          <EyeIcon className="size-4" /> View result
        </Button>
      </Link>
    );

  return (
    <Button
      size="lg"
      variant="outline"
      disabled>
      {state === "scheduled" ?
        <>
          <ClockIcon className="size-4" /> Not yet open
        </>
      : state === "missed" ?
        "Ended"
      : "Unavailable"}
    </Button>
  );
};
