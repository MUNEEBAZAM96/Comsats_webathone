import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

const ResponsiveTable = ({
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { "aria-label": string }) => (
  <div
    role="region"
    tabIndex={0}
    className={cn(
      "workspace-table overflow-x-auto rounded-xl border focus-visible:outline-2",
      className,
    )}
    {...props}
  />
);

export { ResponsiveTable };
