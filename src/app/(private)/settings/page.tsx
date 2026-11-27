import { ProfileSettings } from "@/components/Profile/ProfileSettings";
import { requireSession } from "@/server/session";
import { RouteLoading } from "@/components/Loading/RouteLoading";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your account settings",
};

const SettingsPage = () => (
  <Suspense fallback={<RouteLoading variant="workspace" />}>
    <SettingsPageContent />
  </Suspense>
);

const SettingsPageContent = async () => {
  await requireSession();

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and change your password
        </p>
      </div>
      <ProfileSettings />
    </section>
  );
};

export default SettingsPage;
