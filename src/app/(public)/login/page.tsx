"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { type AccountForm, accountSchema } from "@/lib/schemas";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

const STATUS_MESSAGES: Record<string, string> = {
  account_pending: "Your registration is still awaiting admin review.",
  account_rejected: "Your registration was not approved.",
  email_not_verified: "Please open the verification link you received first.",
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
      router.push(params.get("from") ?? "/recordings");
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.error.code === "account_pending") router.push("/pending");
        else setError(STATUS_MESSAGES[e.error.code] ?? e.error.message);
      } else setError("Network error. Is the API up?");
    }
  }

  return (
    <div className="enter-up w-full max-w-sm">
      <h1 className="type-title text-center">Sign in</h1>
      <p className="mt-2 text-center text-ink-2">
        Your recordings are waiting.
      </p>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-8 space-y-4"
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
        <Field label="Password" error={form.formState.errors.password?.message}>
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
      <p className="mt-6 text-center text-[14px] text-ink-2">
        No account?{" "}
        <Link className="text-accent hover:underline" href="/register">
          Create one
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
