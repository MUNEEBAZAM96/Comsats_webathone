import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/shadcnui/card";

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  trend?: string;
  href?: Route;
};

const cardClass =
  "dashboard-stat grid min-w-0 grid-cols-[minmax(0,1fr)_auto] content-start items-start gap-x-2 gap-y-2.5 p-3.5 sm:gap-x-3 sm:p-4";

const StatCardBody = ({
  icon,
  label,
  value,
  detail,
  trend,
}: Omit<StatCardProps, "href">) => (
  <>
    <div
      aria-hidden="true"
      className="col-start-2 row-start-1 grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-9 [&_svg]:size-4"
    >
      {icon}
    </div>
    <p
      className="col-start-1 row-start-1 self-center wrap-anywhere text-sm font-medium text-muted-foreground"
      title={label}>
      {label}
    </p>
    <p className="col-span-2 wrap-anywhere font-heading text-3xl leading-none font-bold tracking-tight tabular-nums sm:text-4xl">
      {typeof value === "number"
        ? new Intl.NumberFormat("en").format(value)
        : value}
    </p>
    {(detail || trend) && (
      <p className="col-span-2 text-xs leading-relaxed text-muted-foreground">
        {detail}
        {trend && detail && " · "}
        {trend && (
          <span className="font-medium text-foreground">{trend}</span>
        )}
      </p>
    )}
  </>
);

const StatCard = ({ icon, label, value, detail, trend, href }: StatCardProps) => {
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
        <Card
          className={`${cardClass} cursor-pointer transition-colors hover:bg-muted/40`}>
          <StatCardBody
            icon={icon}
            label={label}
            value={value}
            detail={detail}
            trend={trend}
          />
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cardClass}>
      <StatCardBody
        icon={icon}
        label={label}
        value={value}
        detail={detail}
        trend={trend}
      />
    </Card>
  );
};

export { StatCard };
