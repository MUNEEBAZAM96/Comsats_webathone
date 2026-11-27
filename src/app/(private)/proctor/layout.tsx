import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { LayoutProps } from "@/lib/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/Sidebar/SidebarLayout";
import { RouteLoading } from "@/components/Loading/RouteLoading";
import { proctorNav } from "@/components/Sidebar/nav-config";

const ProctorLayout = ({ children }: LayoutProps) => (
  <Suspense fallback={<RouteLoading variant="workspace" />}>
    <ProctorGate>{children}</ProctorGate>
  </Suspense>
);

const ProctorGate = async ({ children }: LayoutProps) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  if (session.user.role !== "proctor") {
    const role = session.user.role;
    if (role === "admin") redirect("/admin");
    if (role === "examiner") redirect("/examiner");
    redirect("/student");
  }

  return <SidebarLayout groups={proctorNav}>{children}</SidebarLayout>;
};

export default ProctorLayout;
