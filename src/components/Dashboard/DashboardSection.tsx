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
  <section aria-labelledby={id} className="min-w-0">
    <Card className="h-full gap-4">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="font-heading text-lg font-semibold">
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

const DashboardEmpty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed bg-muted/25 px-4 py-5 text-sm text-muted-foreground">
    {children}
  </p>
);

export { DashboardSection, DashboardRow, DashboardEmpty };
