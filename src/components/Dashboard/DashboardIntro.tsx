import type { ReactNode } from "react";

const DashboardIntro = ({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <header className="flex flex-col justify-between gap-4 rounded-lg border bg-secondary p-5 sm:flex-row sm:items-center">
    <div className="grid min-w-0 gap-2">
      <h1 className="break-words">{title}</h1>
      <p className="text-sm text-muted-foreground sm:text-base">{children}</p>
    </div>
    {action}
  </header>
);

export { DashboardIntro };
