"use client";

import { useEffect } from "react";
import { StatusPanel } from "@/components/Workspace/StatusPanel";
import { Button } from "@/components/shadcnui/button";
import Link from "next/link";

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

  return (
    <StatusPanel
      title="This page couldn’t load"
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
            render={<Link href="/" />}
            nativeButton={false}>
            Go to sign-in
          </Button>
        </>
      }>
      <p>There was a problem loading this page. Try again in a moment.</p>
      {error.digest && <p className="text-xs">Error ID {error.digest}</p>}
    </StatusPanel>
  );
};

export default ErrorPage;
