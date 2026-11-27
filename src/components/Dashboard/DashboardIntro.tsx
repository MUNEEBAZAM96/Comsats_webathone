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
  <header className="dashboard-intro relative z-0 flex flex-col gap-4 border px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
    <div className="relative z-10 grid min-w-0 gap-1.5">
      <h1 className="wrap-anywhere text-[clamp(1.65rem,3vw,2.35rem)]!">
        {title}
      </h1>
      <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
        {children}
      </p>
    </div>
    {action ?
      <div className="dashboard-intro-action relative z-10 flex flex-wrap gap-2 lg:max-w-[46%] lg:justify-end">
        {action}
      </div>
    : null}
  </header>
);

export { DashboardIntro };
