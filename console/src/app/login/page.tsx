"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { AuthFrame } from "@console/components/AuthFrame";
import { useErrorText } from "@console/components/useErrorText";
import { session } from "@console/lib/client";
import { safeFrom } from "@console/lib/safePath";

/**
 * Sign-in, step one: the person's product account of this environment. The BFF signs
 * in to the product, then asks bt-ops for a console session; the answer says whether the
 * second factor has to be set up or only entered.
 */
function LoginForm() {
  const t = useTranslations("console.auth");
  const errorText = useErrorText();
  const router = useRouter();
  const from = safeFrom(useSearchParams().get("from"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { next } = await session.open(email, password);
      const target = next === "enroll" ? "/login/enroll" : "/login/verify";
      router.push(from ? `${target}?from=${encodeURIComponent(from)}` : target);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-ink-2">{t("intro")}</p>
      <Field label={t("email")}>
        <Input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t("password")}>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <ErrorBanner message={error} />}
      <Button type="submit" className="w-full" disabled={busy}>
        {t("continue")}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations("console.auth");
  return (
    <AuthFrame title={t("signInTitle")}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
