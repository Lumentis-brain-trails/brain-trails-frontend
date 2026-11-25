"use client";

/**
 * The one page a held school student's account can use (backend V4-0012).
 *
 * Three reasons bring someone here, from `GET /schools/me`: their teacher has not
 * verified them yet (`pending`), the teacher could not (`refused`, with the teacher's
 * own words when they gave any), or they joined as a minor and are now 18, so their own
 * consent is asked before they go on. Whatever the reason, the person can sign out and
 * can erase the account: the API keeps both open while everything else is refused.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useAppConfig } from "@/lib/features";
import type { MyEnrolment } from "@/lib/schools";
import { useSignOut } from "@/lib/signOut";
import { AuthPanel } from "@/components/AuthPanel";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

export default function WaitingPage() {
  const t = useTranslations("schools.waiting");
  const errorMessage = useErrorMessage();
  const signOut = useSignOut();
  const router = useRouter();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const [consent, setConsent] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [password, setPassword] = useState("");

  const mine = useQuery({
    queryKey: ["school-me"],
    queryFn: () => api.get<MyEnrolment>("schools/me"),
    retry: false,
  });

  const own = useMutation({
    mutationFn: () => api.post<MyEnrolment>("schools/me/consent", { consent }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/home");
    },
  });

  const erase = useMutation({
    mutationFn: () => api.delete("auth/me", { password }),
    onSuccess: () => signOut("/"),
  });

  const enrolment = mine.data;
  const state =
    enrolment?.hold === "own_consent_required"
      ? "ofAge"
      : enrolment?.status === "refused"
        ? "refused"
        : enrolment?.hold
          ? "pending"
          : enrolment
            ? "open"
            : null;

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <AuthPanel>
        {mine.isError && <ErrorBanner message={errorMessage(mine.error)} />}
        {state === null && !mine.isError && (
          <p className="text-ink-3">{t("loading")}</p>
        )}

        {state === "pending" && (
          <section className="space-y-3">
            <h1 className="type-title">{t("pending.title")}</h1>
            <p className="text-pretty text-ink-2">
              {t("pending.body", { school: enrolment?.school_name ?? "" })}
            </p>
          </section>
        )}

        {state === "refused" && (
          <section className="space-y-3">
            <h1 className="type-title">{t("refused.title")}</h1>
            <p className="text-pretty text-ink-2">
              {t("refused.body", { school: enrolment?.school_name ?? "" })}
            </p>
            {enrolment?.refusal_reason && (
              <blockquote className="rounded-[var(--radius-card)] bg-surface-2 p-4 text-pretty text-ink">
                <span className="mb-1 block text-[13px] text-ink-3">
                  {t("refused.reason")}
                </span>
                {enrolment.refusal_reason}
              </blockquote>
            )}
          </section>
        )}

        {state === "ofAge" && (
          <section className="space-y-4">
            <h1 className="type-title">{t("ofAge.title")}</h1>
            <p className="text-pretty text-ink-2">{t("ofAge.body")}</p>
            <p className="text-[14px]">
              <Link
                className="font-semibold text-ink hover:underline"
                href="/privacy?in=tab"
                target="_blank"
                rel="noreferrer"
              >
                {t("ofAge.policy")}
              </Link>
            </p>
            {config.data?.consent_version && (
              <p className="text-[13px] text-ink-3">
                {t("ofAge.version", { version: config.data.consent_version })}
              </p>
            )}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
              />
              <span>{t("ofAge.tick")}</span>
            </label>
            {own.isError && <ErrorBanner message={errorMessage(own.error)} />}
            <Button
              disabled={!consent || own.isPending}
              onClick={() => own.mutate()}
            >
              {t("ofAge.submit")}
            </Button>
          </section>
        )}

        {state === "open" && (
          <section className="space-y-3">
            <h1 className="type-title">{t("open.title")}</h1>
            <Button
              onClick={() => {
                // the shell's cached `me` still holds the old hold: without this it
                // would send the student straight back here once
                queryClient.clear();
                router.replace("/home");
              }}
            >
              {t("open.go")}
            </Button>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-2 border-t border-hairline pt-6">
          <Button variant="secondary" onClick={() => signOut()}>
            {t("signOut")}
          </Button>
          {!erasing && (
            <Button variant="secondary" onClick={() => setErasing(true)}>
              {t("erase.open")}
            </Button>
          )}
        </div>

        {erasing && (
          <section className="mt-6 space-y-4">
            <h2 className="type-heading">{t("erase.title")}</h2>
            <p className="text-pretty text-ink-2">{t("erase.body")}</p>
            {erase.isError && (
              <ErrorBanner message={errorMessage(erase.error)} />
            )}
            <Field label={t("erase.password")}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setErasing(false);
                  setPassword("");
                }}
              >
                {t("erase.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={!password || erase.isPending}
                onClick={() => erase.mutate()}
              >
                {erase.isPending ? t("erase.erasing") : t("erase.confirm")}
              </Button>
            </div>
          </section>
        )}
      </AuthPanel>
    </main>
  );
}
