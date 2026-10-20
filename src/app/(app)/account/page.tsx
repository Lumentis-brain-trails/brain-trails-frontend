"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { UserInfo } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import {
  type ProfileData,
  ProfileCard,
} from "@/components/account/ProfileCard";
import { type ApplicationData, BetaCard } from "@/components/account/BetaCard";
import { LanguageCard } from "@/components/account/LanguageCard";
import {
  type ConsentData,
  PrivacyCard,
} from "@/components/account/PrivacyCard";
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
import { useToast } from "@/components/Toast";

export default function AccountPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("account");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
  });
  // 404 is the normal state of a fresh account now, not an error: registration stopped
  // asking for the profile (V3-0008, amended). `retry: false` keeps it from looking like
  // a flaky request, and `missing` is what the card explains.
  const profile = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api.get<ProfileData>("auth/me/profile"),
    retry: false,
  });
  const application = useQuery({
    queryKey: ["me-application"],
    queryFn: () => api.get<ApplicationData>("auth/me/application"),
    retry: false,
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
      toast("success", t("delete.done"));
      router.push("/");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title mb-8">{t("title")}</h1>
      <div className="space-y-8">
        <section>
          <SectionTitle>{t("access.title")}</SectionTitle>
          <Card inset>
            {me.data ? (
              <>
                <KeyValue label={t("access.email")} value={me.data.email} />
                <KeyValue
                  label={t("access.role")}
                  value={
                    me.data.role === "admin"
                      ? t("access.roleAdmin")
                      : t("access.roleParticipant")
                  }
                />
                <KeyValue
                  label={t("access.memberSince")}
                  value={new Date(me.data.created_at).toLocaleDateString(
                    locale,
                    { dateStyle: "long" }
                  )}
                />
              </>
            ) : (
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            )}
          </Card>
        </section>

        <section>
          <LanguageCard />
        </section>

        <section>
          {profile.isLoading ? (
            <Card inset>
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ) : (
            <ProfileCard data={profile.data} missing={!profile.data} />
          )}
        </section>

        <section>
          {!consent.isLoading && <PrivacyCard data={consent.data} />}
        </section>

        <section>
          {!application.isLoading && <BetaCard data={application.data} />}
        </section>

        <section>
          <SectionTitle>{t("data.title")}</SectionTitle>
          <Card inset>
            <a
              href="/api/backend/auth/me/export"
              download="brain-trails-export.json"
              className="pressable flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 hover:bg-surface-2"
            >
              <span>
                <span className="block">{t("data.export")}</span>
                <span className="type-caption text-ink-3">
                  {t("data.exportHint")}
                </span>
              </span>
              <Icon name="download" className="text-ink-3" />
            </a>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="pressable flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-danger hover:bg-surface-2"
            >
              <span>
                <span className="block">{t("data.delete")}</span>
                <span className="type-caption text-ink-3">
                  {t("data.deleteHint")}
                </span>
              </span>
              <Icon name="trash" className="text-ink-3" />
            </button>
          </Card>
        </section>
      </div>

      {confirm && (
        <Sheet title={t("delete.title")} onClose={() => setConfirm(false)}>
          <div className="space-y-4">
            <p className="text-ink-2">{t("delete.text")}</p>
            {error && <ErrorBanner message={error} />}
            <Field label={t("delete.password")}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                {t("delete.keep")}
              </Button>
              <Button
                variant="danger"
                disabled={!password || erase.isPending}
                onClick={() => erase.mutate()}
              >
                {erase.isPending ? t("delete.deleting") : t("delete.confirm")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </main>
  );
}
