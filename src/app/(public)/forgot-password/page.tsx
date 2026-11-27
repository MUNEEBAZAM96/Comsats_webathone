import { AuthHeading } from "@/components/Auth/AuthHeading";
import ForgotPasswordForm from "@/components/Auth/ForgotPasswordForm";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a password reset for your ExamGuard account",
};

const ForgotPasswordPage = () => (
  <section className="grid gap-6">
    <AuthHeading
      title="Forgot password?"
      description="Enter the email address associated with your account."
    />
    <ForgotPasswordForm />
    <p className="border-t pt-5 text-center text-sm">
      <Link
        href="/"
        className="font-semibold text-primary underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </p>
  </section>
);

export default ForgotPasswordPage;
