"use client";

import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthFrame } from "@console/components/AuthFrame";
import { CodeForm } from "@console/components/CodeForm";

/** Sign-in, step two for someone already enrolled: the code from the authenticator. */
export default function VerifyPage() {
  const t = useTranslations("console.auth");
  return (
    <AuthFrame title={t("verifyTitle")}>
      <p className="mb-4 text-ink-2">{t("verifyIntro")}</p>
      <Suspense>
        <CodeForm />
      </Suspense>
    </AuthFrame>
  );
}
