import { AuthHeading } from "@/components/Auth/AuthHeading";
import LoginForm from "@/components/Auth/LoginForm";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ExamGuard workspace",
};

const LoginPage = () => (
  <section className="auth-entry grid">
    <AuthHeading
      title="Welcome back"
      description="Sign in to your ExamGuard workspace."
    />
    <LoginForm />
    <p className="text-center text-sm text-muted-foreground">
      <Link
        href="/forgot-password"
        className="font-semibold text-primary underline-offset-4 hover:underline"
      >
        Forgot your password?
      </Link>
    </p>
    <p className="border-t pt-3 sm:pt-4 text-center text-sm text-muted-foreground">
      New to ExamGuard?{" "}
      <Link
        href="/register"
        className="font-semibold text-primary underline-offset-4 hover:underline"
      >
        Create an account
      </Link>
    </p>
  </section>
);

export default LoginPage;
