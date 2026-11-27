import ResetPasswordForm from "@/components/Auth/ResetPasswordForm";
import { AuthHeading } from "@/components/Auth/AuthHeading";
import { RouteLoading } from "@/components/Loading/RouteLoading";
import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password",
};

const ResetPasswordPage = () => {
  return (
    <section className="grid gap-6">
      <AuthHeading
        title="Reset password"
        description="Choose a new password for your account."
      />
      <Suspense fallback={<RouteLoading variant="auth" />}>
        <ResetPasswordForm />
      </Suspense>
      <p className="border-t pt-6 text-center text-sm text-muted-foreground">
        <Link
          href="/"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </section>
  );
};

export default ResetPasswordPage;
