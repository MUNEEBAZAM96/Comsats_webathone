import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { LayoutProps } from "@/lib/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const PrivateLayoutFallback = () => (
  <main aria-busy="true" aria-label="Loading workspace" className="mx-auto grid max-w-[94rem] gap-6 p-4 sm:p-6 lg:p-8">
    <div className="h-28 animate-pulse rounded-lg border bg-secondary" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg border bg-card" />
      ))}
    </div>
  </main>
);

const PrivateLayout = ({ children }: LayoutProps) => (
  <Suspense fallback={<PrivateLayoutFallback />}>
    <AuthGate>{children}</AuthGate>
  </Suspense>
);

const AuthGate = async ({ children }: LayoutProps) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  return <>{children}</>;
};

export default PrivateLayout;
