import RegisterForm from "@/components/Auth/RegisterForm";
import { AuthHeading } from "@/components/Auth/AuthHeading";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an account to get started",
};

const RegisterPage = () => {
  return (
    <section className="grid gap-8">
      <AuthHeading
        title="Create an account"
        description="Set up your candidate account."
      />
      <RegisterForm />
      <p className="border-t pt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </section>
  );
};

export default RegisterPage;
