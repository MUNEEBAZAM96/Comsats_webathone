import { Badge } from "@/components/shadcnui/badge";
import type { CandidateExamState } from "@/lib/exam/eligibility";

const stateMap: Record<CandidateExamState, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-warning-surface text-warning" },
  available: { label: "Available now", className: "bg-success-surface text-success" },
  in_progress: { label: "In Progress", className: "bg-warning-surface text-warning" },
  time_up: { label: "Time up", className: "bg-muted text-muted-foreground" },
  submitted: { label: "Submitted", className: "bg-info-surface text-info" },
  graded: { label: "Graded", className: "bg-success-surface text-success" },
  missed: { label: "Ended", className: "bg-error-surface text-destructive" },
  no_questions: { label: "Not ready", className: "bg-muted text-muted-foreground" },
  unavailable: { label: "Unavailable", className: "bg-muted text-muted-foreground" },
};

export const CandidateExamStateBadge = ({ state }: { state: CandidateExamState }) => {
  const s = stateMap[state];
  return <Badge className={s.className}>{s.label}</Badge>;
};
