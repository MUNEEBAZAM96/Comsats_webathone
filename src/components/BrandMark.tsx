import { ShieldCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const BrandMark = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-2.5 font-heading font-bold tracking-tight",
      className,
    )}
  >
    <span
      className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
      data-brand-icon=""
    >
      <ShieldCheckIcon
        aria-hidden="true"
        className="size-5"
        strokeWidth={1.75}
      />
    </span>
    <span data-brand-name="">ExamGuard</span>
  </span>
);

export { BrandMark };
