import { Badge } from "@/components/shadcnui/badge";

const examStatusMap: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  published: {
    label: "Available",
    className:
      "bg-success-surface text-success",
  },
};

const ExamStatusBadge = ({ status }: { status: string }) => {
  const s = examStatusMap[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return <Badge className={s.className}>{s.label}</Badge>;
};

export { ExamStatusBadge };
