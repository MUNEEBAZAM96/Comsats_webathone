import type { ComponentProps } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/shadcnui/button";
import { cn } from "@/lib/utils";

const DashboardLink = ({
  variant = "default",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: "default" | "outline" }) => (
  <Link
    data-slot="button"
    data-variant={variant}
    className={cn(buttonVariants({ size: "lg", variant }), "w-fit", className)}
    {...props}
  />
);

export { DashboardLink };
