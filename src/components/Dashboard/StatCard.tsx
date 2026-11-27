import type { ReactNode } from "react";
import { Card } from "@/components/shadcnui/card";

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
};

const StatCard = ({ icon, label, value, detail }: StatCardProps) => (
  <Card className="dashboard-stat grid min-w-0 grid-cols-[minmax(0,1fr)_auto] content-start items-start gap-x-2 gap-y-2.5 p-3.5 sm:gap-x-3 sm:p-4">
    <div
      aria-hidden="true"
      className="col-start-2 row-start-1 grid size-8 place-items-center rounded-lg sm:size-9 [&_svg]:size-4"
    >
      {icon}
    </div>
    <p className="col-start-1 row-start-1 self-center wrap-anywhere text-sm font-medium text-muted-foreground">
      {label}
    </p>
    <p className="col-span-2 wrap-anywhere font-heading text-3xl leading-none font-bold tracking-tight tabular-nums sm:text-4xl">
      {typeof value === "number"
        ? new Intl.NumberFormat("en").format(value)
        : value}
    </p>
    {detail && (
      <p className="col-span-2 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
    )}
  </Card>
);

export { StatCard };
