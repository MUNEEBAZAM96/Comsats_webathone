import ForgotPasswordForm from "@/components/Auth/ForgotPasswordForm";
import { AuthHeading } from "@/components/Auth/AuthHeading";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your password",
};

const ForgotPasswordPage = () => {
  return (
    <section className="grid gap-8">
      <AuthHeading
        title="Forgot password"
        description="Enter the email address associated with your account."
      />
      <ForgotPasswordForm />
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

export default ForgotPasswordPage;
