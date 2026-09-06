"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { type AccountForm, accountSchema } from "@/lib/schemas";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

const STATUS_MESSAGES: Record<string, string> = {
  account_pending: "Your registration is still awaiting admin review.",
  account_rejected: "Your registration was not approved.",
  email_not_verified: "Please open the verification link you received first.",
  invalid_credentials: "Wrong email or password.",
  rate_limited: "Too many attempts - wait a minute and retry.",
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
      } else setError("Network error - is the API up?");
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {error && <ErrorBanner message={error} />}
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
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
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-neutral-500">
        No account?{" "}
        <Link className="text-indigo-600 hover:underline" href="/register">
          Register
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
