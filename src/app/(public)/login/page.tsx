"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { type AccountForm, accountSchema } from "@/lib/schemas";
import { AuthPanel } from "@/components/AuthPanel";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

const STATUS_MESSAGES: Record<string, string> = {
  account_pending: "Your registration is still awaiting admin review.",
  account_rejected: "Your registration was not approved.",
  account_waitlisted:
    "Your application is on the waiting list. We will write to you as soon as there is room.",
  email_not_verified:
    "Your account is approved but the email is not verified yet. Ask an administrator for the link.",
  invalid_credentials: "Wrong email or password.",
  rate_limited: "Too many attempts. Wait a minute and retry.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AccountForm>({ resolver: zodResolver(accountSchema) });

  async function onSubmit(values: AccountForm) {
    setError(null);
    try {
      await api.login(values.email, values.password);
      router.push(params.get("from") ?? "/home");
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.error.code === "account_pending") router.push("/pending");
        else setError(STATUS_MESSAGES[e.error.code] ?? e.error.message);
      } else setError("Network error. Is the API up?");
    }
  }

  return (
    <div className="enter-up flex w-full max-w-[400px] flex-col items-center">
      <h1 className="font-display text-center text-[clamp(2.4rem,7vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.034em]">
        Welcome back.
      </h1>
      <p className="font-display mt-3 text-center text-[17px] font-light text-ink-2">
        Your trails are where you left them.
      </p>
      <AuthPanel className="mt-9 w-full">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          {error && <ErrorBanner message={error} />}
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...form.register("email")}
            />
          </Field>
          <Field
            label="Password"
            error={form.formState.errors.password?.message}
          >
            <Input
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </AuthPanel>
      <p className="mt-7 text-center text-[14px] text-ink-2">
        New here?{" "}
        <Link
          className="font-semibold text-ink hover:underline"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
