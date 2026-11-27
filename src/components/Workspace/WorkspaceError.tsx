"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { StatusPanel } from "@/components/Workspace/StatusPanel";
import { Button } from "@/components/shadcnui/button";
import Link from "next/link";
import type { Route } from "next";

const roleDashboards: { prefix: string; href: Route; label: string }[] = [
  { prefix: "/admin", href: "/admin" as Route, label: "Go to dashboard" },
  { prefix: "/examiner", href: "/examiner" as Route, label: "Go to dashboard" },
  { prefix: "/proctor", href: "/proctor" as Route, label: "Go to dashboard" },
  { prefix: "/student", href: "/student" as Route, label: "Go to dashboard" },
];

const ErrorPage = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const pathname = usePathname();
  const matched = roleDashboards.find(({ prefix }) =>
    pathname.startsWith(prefix),
  );
  const homeHref: Route = matched?.href ?? ("/" as Route);
  const homeLabel = matched?.label ?? "Go to sign-in";

  return (
    <StatusPanel
      title="This page couldn't load"
      actions={
        <>
          <Button
            size="lg"
            onClick={reset}>
            Try again
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<Link href={homeHref} />}
            nativeButton={false}>
            {homeLabel}
          </Button>
        </>
      }>
      <p>There was a problem loading this page. Try again in a moment.</p>
      {error.digest && <p className="text-xs">Error ID {error.digest}</p>}
    </StatusPanel>
  );
};

export default ErrorPage;
