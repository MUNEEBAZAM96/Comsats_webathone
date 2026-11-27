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
    <section className="grid w-full gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="text-muted-foreground">
          Update your profile, account details, and password.
        </p>
      </div>
      <ProfileSettings />
    </section>
  );
};

export default SettingsPage;
