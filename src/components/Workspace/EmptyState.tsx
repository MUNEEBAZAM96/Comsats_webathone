import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center gap-4 py-16 text-center">
    {icon && (
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-6">
        {icon}
      </span>
    )}
    <div className="grid gap-1.5">
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
    {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

export { EmptyState };
