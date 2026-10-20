"use client";

/**
 * The client's account (backend V4-0006, sprint T3): the address, the language, the
 * privacy note they agreed to, and erasure.
 *
 * Smaller than the app's account page on purpose: a patient has no profile to fill (their
 * carer keeps their file), no beta to join and no recordings of their own to export -
 * what they recorded belongs to the organisation that recorded it, which the delete
 * dialog says plainly.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { UserInfo } from "@/lib/types";
import { LanguageCard } from "@/components/account/LanguageCard";
import {
  type ConsentData,
  PrivacyCard,
} from "@/components/account/PrivacyCard";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Icon,
  Input,
  KeyValue,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

export default function MyAccountPage() {
  const t = useTranslations("my.account");
  const router = useRouter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
  });
  const consent = useQuery({
    queryKey: ["me-consent"],
    queryFn: () => api.get<ConsentData>("auth/me/consent"),
    retry: false,
  });
  const erase = useMutation({
    mutationFn: () => api.delete("auth/me", { password }),
    onSuccess: async () => {
      await api.logout();
      toast("success", t("done"));
      router.push("/");
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title mb-8">{t("title")}</h1>
      <div className="space-y-8">
        <section>
          <Card inset>
            {me.data ? (
              <KeyValue label={t("email")} value={me.data.email} />
            ) : (
              <Skeleton className="m-5 h-4 w-2/3" />
            )}
          </Card>
        </section>
        <section>
          <LanguageCard />
        </section>
        <section>
          {!consent.isLoading && <PrivacyCard data={consent.data} />}
        </section>
        <section>
          <SectionTitle>{t("delete")}</SectionTitle>
          <Card inset>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="pressable flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-danger hover:bg-surface-2"
            >
              <span>
                <span className="block">{t("delete")}</span>
                <span className="type-caption text-ink-3">
                  {t("deleteHint")}
                </span>
              </span>
              <Icon name="trash" className="text-ink-3" />
            </button>
          </Card>
        </section>
      </div>
      {confirm && (
        <Sheet title={t("deleteTitle")} onClose={() => setConfirm(false)}>
          <div className="space-y-4">
            <p className="text-ink-2">{t("deleteText")}</p>
            {erase.isError && (
              <ErrorBanner message={errorMessage(erase.error)} />
            )}
            <Field label={t("password")}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                {t("keep")}
              </Button>
              <Button
                variant="danger"
                disabled={!password || erase.isPending}
                onClick={() => erase.mutate()}
              >
                {erase.isPending ? t("deleting") : t("confirm")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </main>
  );
}
