import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="empty-state flex flex-col items-center gap-4 px-6 py-16 text-center">
    {icon ?
      <span
        aria-hidden="true"
        className="bg-card text-muted-foreground grid size-12 place-items-center rounded-2xl border shadow-sm [&_svg]:size-6">
        {icon}
      </span>
    : null}
    <div className="grid max-w-md gap-1.5">
      <p className="font-heading text-base font-semibold text-foreground">
        {title}
      </p>
      {description ?
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      : null}
    </div>
    {action ?
      <div className="flex flex-wrap justify-center gap-2">{action}</div>
    : null}
  </div>
);

export { EmptyState };
