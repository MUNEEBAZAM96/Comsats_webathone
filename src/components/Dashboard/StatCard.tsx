import type { ReactNode } from "react";
import { Card } from "@/components/shadcnui/card";

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
};

const StatCard = ({ icon, label, value }: StatCardProps) => (
  <Card className="min-w-0 gap-4 p-5">
    <div className="flex min-w-0 items-center justify-between gap-3">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary [&_svg]:size-5"
      >
        {icon}
      </div>
    </div>
    <p className="break-words font-heading text-3xl leading-none font-bold tracking-tight tabular-nums">
      {value}
    </p>
  </Card>
);

export { StatCard };
