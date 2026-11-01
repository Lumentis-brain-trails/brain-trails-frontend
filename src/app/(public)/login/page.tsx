"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { type AccountForm, accountSchema } from "@/lib/schemas";
import { useValidationMessage } from "@/lib/validationMessage";
import { AuthPanel } from "@/components/AuthPanel";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const t = useTranslations("public.login");
  const tStatus = useTranslations("auth.status");
  const errorMessage = useErrorMessage();
  const fieldError = useValidationMessage();
  // The thrown error itself, not its sentence: it is put into words at render, so it
  // follows the language if that is switched while the banner is up.
  const [error, setError] = useState<unknown>(null);
  const form = useForm<AccountForm>({ resolver: zodResolver(accountSchema) });

  /**
   * Why sign-in was refused. The account's status has its own wording here
   * (`auth.status.<code>`), ahead of the general sentence for the same code; anything
   * else reads as any other failed call does.
   */
  function describe(e: unknown): string {
    if (e instanceof ApiRequestError && tStatus.has(e.error.code as never)) {
      return tStatus(e.error.code as never);
    }
    return errorMessage(e);
  }

  async function onSubmit(values: AccountForm) {
    setError(null);
    try {
      await api.login(values.email, values.password);
      // a session that expired never signed out: nothing of it may show to this one
      queryClient.clear();
      router.push(params.get("from") ?? "/home");
    } catch (e) {
      if (e instanceof ApiRequestError && e.error.code === "account_pending") {
        router.push("/pending");
      } else setError(e);
    }
  }

  return (
    <div className="enter-up flex w-full max-w-[400px] flex-col items-center">
      <h1 className="font-display text-center text-[clamp(2.4rem,7vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.034em]">
        {t("title")}
      </h1>
      <p className="font-display mt-3 text-center text-[17px] font-light text-ink-2">
        {t("subtitle")}
      </p>
      <AuthPanel className="mt-9 w-full">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          {error !== null && <ErrorBanner message={describe(error)} />}
          <Field
            label={t("email")}
            error={fieldError(form.formState.errors.email?.message)}
          >
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...form.register("email")}
            />
          </Field>
          <Field
            label={t("password")}
            error={fieldError(form.formState.errors.password?.message)}
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
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </AuthPanel>
      <p className="mt-7 text-center text-[14px] text-ink-2">
        {t.rich("newHere", {
          link: (chunks) => (
            <Link
              className="font-semibold text-ink hover:underline"
              href="/register"
            >
              {chunks}
            </Link>
          ),
        })}
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
