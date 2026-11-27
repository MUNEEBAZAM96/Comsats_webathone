import type { ReactNode } from "react";
import { Card } from "@/components/shadcnui/card";

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
};

const StatCard = ({ icon, label, value }: StatCardProps) => (
  <Card className="dashboard-stat min-w-0 gap-4 p-4 sm:p-5">
    <div
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5">
      {icon}
    </div>
    <div className="grid min-w-0 gap-2">
      <p className="wrap-break-word font-heading text-3xl leading-none font-bold tracking-tight tabular-nums sm:text-4xl">
        {value}
      </p>
      <p className="wrap-break-word text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  </Card>
);

export { StatCard };
