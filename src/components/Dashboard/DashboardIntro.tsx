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
  <header className="dashboard-intro flex min-h-40 flex-col justify-center gap-5 overflow-hidden rounded-2xl border px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
    <div className="grid min-w-0 gap-2">
      <h1 className="text-[clamp(1.9rem,4vw,3.15rem)]!">{title}</h1>
      <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
    {action && (
      <div className="dashboard-intro-action flex shrink-0 flex-wrap gap-2">
        {action}
      </div>
    )}
  </header>
);

export { DashboardIntro };
