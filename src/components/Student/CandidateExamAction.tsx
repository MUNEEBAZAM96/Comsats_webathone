import Link from "next/link";
import { ClockIcon, EyeIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/shadcnui/button";
import type { CandidateExamEligibility } from "@/lib/exam/eligibility";

type Props = {
  examId: string;
  attemptId: string | null;
  eligibility: CandidateExamEligibility;
};

/** The single primary action for an assigned exam, decided by server eligibility. */
export const CandidateExamAction = ({
  examId,
  attemptId,
  eligibility,
}: Props) => {
  const { action, state } = eligibility;

  if (action === "start" || action === "resume")
    return (
      <Link
        prefetch={false}
        href={`/student/exams/${examId}`}
        data-slot="button"
        data-variant="default"
        className={buttonVariants({ size: "lg" })}
      >
        {action === "start" ? (
          <>
            <PlayIcon aria-hidden="true" /> Start
          </>
        ) : (
          <>
            <RotateCcwIcon aria-hidden="true" />{" "}
            {state === "time_up" ? "Finalize" : "Resume"}
          </>
        )}
      </Link>
    );

  if (action === "view_result" && attemptId)
    return (
      <Link
        href={`/student/results/${attemptId}`}
        data-slot="button"
        data-variant="outline"
        className={buttonVariants({ size: "lg", variant: "outline" })}
      >
        <EyeIcon aria-hidden="true" /> View result
      </Link>
    );

  return (
    <Button size="lg" variant="outline" disabled>
      {state === "scheduled" ? (
        <>
          <ClockIcon aria-hidden="true" /> Not yet open
        </>
      ) : state === "missed" ? (
        "Ended"
      ) : (
        "Unavailable"
      )}
    </Button>
  );
};
