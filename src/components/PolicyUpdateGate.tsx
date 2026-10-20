"use client";

/**
 * Asks again when the privacy note has moved since this account agreed (V3-0011).
 *
 * `GET /auth/me/consent` returns the version published today beside the one the account
 * actually agreed to. They differ exactly when the note has changed, and the first
 * accounts on this prototype agreed to a placeholder - a version string naming a text
 * nobody had written. Letting those people carry on without being asked again would mean
 * the only record of what they consented to is a word that means "nothing yet".
 *
 * It replaces the app rather than sitting over it: a dismissible banner is a question
 * somebody answers by ignoring it. There are two ways out, agree or sign out, and no
 * third one that quietly means "later".
 *
 * Deliberately not shown for `research`: that one is optional, so its default answer is
 * already the truthful one and nobody needs interrupting to give it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { ConsentData } from "@/components/account/PrivacyCard";
import { Button, Card, ErrorBanner, SectionTitle } from "@/components/ui";

/** Where to write instead of agreeing; an address, so it is the same in every language. */
const PRIVACY_EMAIL = "privacy@lumentis.ca";

export function PolicyUpdateGate({ consent }: { consent: ConsentData }) {
  const router = useRouter();
  const t = useTranslations("shell");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const agree = useMutation({
    mutationFn: () => api.put("auth/me/consent", { core: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me-consent"] });
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-16">
      <Card>
        <SectionTitle>{t("policyUpdate.title")}</SectionTitle>
        <div className="mt-4 space-y-4 text-pretty text-ink-2">
          <p>{t("policyUpdate.text")}</p>
          <p className="type-caption text-ink-3">
            {t("policyUpdate.versions", {
              agreed: consent.core_version,
              current: consent.current_version,
            })}
          </p>
        </div>

        {agree.error && (
          <div className="mt-4">
            <ErrorBanner message={errorMessage(agree.error)} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/privacy?in=tab"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink hover:underline"
          >
            {t.rich("policyUpdate.readNote", {
              hidden: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => agree.mutate()} disabled={agree.isPending}>
            {agree.isPending
              ? t("policyUpdate.saving")
              : t("policyUpdate.agree")}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await api.logout();
              router.push("/login");
            }}
          >
            {t("signOut")}
          </Button>
        </div>

        <p className="type-caption mt-6 text-ink-3">
          {t("policyUpdate.decline", { email: PRIVACY_EMAIL })}
        </p>
      </Card>
    </main>
  );
}
