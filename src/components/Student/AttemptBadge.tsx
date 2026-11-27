import { Badge } from "@/components/shadcnui/badge";

const attemptStatusMap: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "In Progress",
    className:
      "bg-warning-surface text-warning",
  },
  submitted: {
    label: "Submitted",
    className:
      "bg-info-surface text-info",
  },
  graded: {
    label: "Graded",
    className:
      "bg-success-surface text-success",
  },
};

const AttemptBadge = ({ status }: { status: string | undefined }) => {
  if (!status) return null;
  const s = attemptStatusMap[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return <Badge className={s.className}>{s.label}</Badge>;
};

export { AttemptBadge };
