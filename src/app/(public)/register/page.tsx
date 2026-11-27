import { AuthHeading } from "@/components/Auth/AuthHeading";
import RegisterForm from "@/components/Auth/RegisterForm";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an ExamGuard candidate account",
};

const RegisterPage = () => (
  <section className="auth-entry grid">
    <AuthHeading
      title="Create an account"
      description="Set up your candidate account to take exams and view your results."
    />
    <RegisterForm />
    <p className="border-t pt-3 sm:pt-4 text-center text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link
        href="/"
        className="font-semibold text-primary underline-offset-4 hover:underline">
        Sign in
      </Link>
    </p>
  </section>
);

export default RegisterPage;
