import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { LayoutProps } from "@/lib/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Auth-gated tree reads cookies/session; allow blocking navigations here. */
export const instant = false;

const PrivateLayout = ({ children }: LayoutProps) => (
  <Suspense fallback={null}>
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
