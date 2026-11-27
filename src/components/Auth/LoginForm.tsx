"use client";

import { authClient } from "@/lib/auth-client";
import { loginFormSchema, LoginFormType } from "@/lib/zodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import AuthTestBanner from "./AuthTestBanner";
import { Button } from "../shadcnui/button";
import { Checkbox } from "../shadcnui/checkbox";
import { Field, FieldError, FieldLabel } from "../shadcnui/field";
import { Input } from "../shadcnui/input";

const LoginForm = () => {
  const { replace } = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setError,
    reset,
    setValue,
  } = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    mode: "all",
  });

  const fillSeedAccount = (email: string, password: string) => {
    setValue("email", email, { shouldValidate: true, shouldDirty: true });
    setValue("password", password, { shouldValidate: true, shouldDirty: true });
  };

  const loginFormHandler = async ({
    email,
    password,
    rememberMe,
  }: LoginFormType) => {
    const response = await authClient.signIn
      .email({ email, password, rememberMe })
      .catch(() => null);
    if (!response || response.error) {
      setError("root", {
        message:
          response?.error?.message ??
          "Could not sign in. Check your connection and try again.",
      });
      return;
    }
    const { data } = response;

    const role = data?.user?.role;

    toast.success("Signed in");
    reset();

    if (role === "admin") replace("/admin");
    else if (role === "examiner") replace("/examiner");
    else if (role === "proctor") replace("/proctor");
    else replace("/student");
  };

  return (
    <form
      onSubmit={handleSubmit(loginFormHandler)}
      className="grid gap-6"
      noValidate>
      <AuthTestBanner
        showSeedHelper
        onFillAccount={fillSeedAccount}
      />

      {/* Email field */}
      <Controller
        name="email"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
            <Input
              {...field}
              id={field.name}
              type="email"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? "login-email-error" : undefined
              }
              placeholder="you@example.com"
              autoComplete="email"
            />
            {fieldState.invalid && (
              <FieldError id="login-email-error" errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />

      {/* Password field */}
      <Controller
        name="password"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Password</FieldLabel>
            <div className="relative">
              <Input
                {...field}
                id={field.name}
                type={showPassword ? "text" : "password"}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-password-error" : undefined
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 text-muted-foreground"
              >
                {showPassword ? (
                  <EyeOffIcon aria-hidden="true" />
                ) : (
                  <EyeIcon aria-hidden="true" />
                )}
              </Button>
            </div>
            {fieldState.invalid && (
              <FieldError
                id="login-password-error"
                errors={[fieldState.error]}
              />
            )}
          </Field>
        )}
      />

      {/* Remember Me checkbox */}
      <Controller
        name="rememberMe"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} orientation={"horizontal"}>
            <Checkbox
              id={field.name}
              aria-labelledby="remember-me-label"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
              className="cursor-pointer"
            />
            <FieldLabel id="remember-me-label" htmlFor={field.name}>
              Keep me signed in
            </FieldLabel>

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {errors.root?.message && (
        <p
          role="alert"
          className="rounded-md bg-error-surface px-3 py-2.5 text-sm text-destructive"
        >
          {errors.root.message}
        </p>
      )}
      <Button
        className="w-full justify-between"
        size="lg"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
        {isSubmitting ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRightIcon aria-hidden="true" />
        )}
      </Button>
    </form>
  );
};

export default LoginForm;
