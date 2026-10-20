"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import { OpsRequestError, session } from "@console/lib/client";
import { safeFrom } from "@console/lib/safePath";

/**
 * The six-digit code from the authenticator. A right one opens the console where the
 * person was going; five wrong ones end the sign-in at bt-ops, and the form says so.
 */
export function CodeForm() {
  const t = useTranslations("console.auth");
  const errorText = useErrorText();
  const router = useRouter();
  const from = safeFrom(useSearchParams().get("from"));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.verify(code);
      router.replace(from ?? "/");
    } catch (e) {
      if (e instanceof OpsRequestError && e.signedOut) {
        router.replace("/login");
        return;
      }
      setError(errorText(e));
      setCode("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("code")} hint={t("codeHint")}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      {error && <ErrorBanner message={error} />}
      <Button type="submit" className="w-full" disabled={busy}>
        {t("verify")}
      </Button>
    </form>
  );
}
