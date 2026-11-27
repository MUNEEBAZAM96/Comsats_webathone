import { AlertTriangleIcon, FileQuestionIcon } from "lucide-react";
import type { ReactNode } from "react";

const StatusPanel = ({
  tone = "error",
  title,
  children,
  actions,
}: {
  tone?: "error" | "info";
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) => {
  const Icon = tone === "error" ? AlertTriangleIcon : FileQuestionIcon;

  return (
    <section className="status-page grid min-h-[55dvh] flex-1 place-items-center px-4 py-10">
      <div className="status-panel mx-auto grid w-full max-w-lg justify-items-center gap-5 rounded-3xl border bg-card p-6 text-center sm:p-9">
        <span
          className={
            tone === "error" ?
              "status-icon bg-error-surface text-destructive"
            : "status-icon bg-info-surface text-info"
          }>
          <Icon
            aria-hidden="true"
            className="size-6"
          />
        </span>
        <div className="grid gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <div className="grid gap-2 text-muted-foreground">{children}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </section>
  );
};

export { StatusPanel };
