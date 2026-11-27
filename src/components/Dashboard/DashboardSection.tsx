import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/shadcnui/card";

const DashboardSection = ({
  id,
  title,
  children,
  action,
}: {
  id: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <section
    aria-labelledby={id}
    className="min-w-0">
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={id}
          className="font-heading text-base font-semibold">
          {title}
        </h2>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  </section>
);

const DashboardRow = ({ children }: { children: ReactNode }) => (
  <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
    {children}
  </li>
);

export { DashboardSection, DashboardRow };
