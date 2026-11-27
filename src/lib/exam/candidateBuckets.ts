import type { CandidateExamBucket } from "@/lib/exam/eligibility";

type WithEligibility = {
  startTime: Date | null;
  eligibility: { bucket: CandidateExamBucket; state: string };
};

const startMs = (e: WithEligibility) =>
  e.startTime ? e.startTime.getTime() : Number.POSITIVE_INFINITY;

/** Split server-computed exam items into the three candidate lists. */
export const groupCandidateExams = <T extends WithEligibility>(exams: T[]) => ({
  // In-progress attempts first so candidates resume before starting new ones.
  available: exams
    .filter((e) => e.eligibility.bucket === "available")
    .sort(
      (a, b) =>
        Number(b.eligibility.state === "in_progress") -
        Number(a.eligibility.state === "in_progress"),
    ),
  upcoming: exams
    .filter((e) => e.eligibility.bucket === "upcoming")
    .sort((a, b) => startMs(a) - startMs(b)),
  completed: exams.filter((e) => e.eligibility.bucket === "completed"),
});
