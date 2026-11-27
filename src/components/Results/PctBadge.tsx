import { Badge } from "@/components/shadcnui/badge";

const PctBadge = ({ pct }: { pct: number }) => {
  const className =
    pct >= 80 ?
      "bg-success-surface text-success"
    : pct >= 50 ?
      "bg-warning-surface text-warning"
    : "bg-error-surface text-destructive";
  return <Badge className={className}>{pct}%</Badge>;
};

export { PctBadge };
