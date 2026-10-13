"use client";

/**
 * Consent, from the account page (V3-0011).
 *
 * Two answers, shown as what they are. The core processing consent is read-only here:
 * an account cannot exist without it, so an unticked box would be a deletion request
 * wearing the wrong clothes, and the way to take it back is the delete button below.
 * The research consent is the one that moves, and it moves in both directions.
 *
 * The version and date are shown rather than tucked away: what somebody agreed to, and
 * when, is the part they have a right to see without asking us for it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import Link from "next/link";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useToast } from "@/components/Toast";
import { Card, ErrorBanner, KeyValue, SectionTitle } from "@/components/ui";

/** `GET /auth/me/consent`: both answers, against the text published today. */
export interface ConsentData {
  current_version: string;
  core_version: string;
  core_at: string;
  research: boolean;
  research_at: string | null;
  research_version: string | null;
}

const PRIVACY_EMAIL = "privacy@lumentis.ca";

function onDate(value: string | null, locale: string): string {
  return value ? new Date(value).toLocaleDateString(locale) : "–";
}

export function PrivacyCard({ data }: { data: ConsentData | undefined }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const t = useTranslations("account.privacy");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();

  const save = useMutation({
    mutationFn: (research: boolean) => api.put("auth/me/consent", { research }),
    onSuccess: async (_result, research) => {
      toast("success", research ? t("thanks") : t("withdrawn"));
      await queryClient.invalidateQueries({ queryKey: ["me-consent"] });
    },
  });

  if (!data) return null;

  // One sentence with two links inside: the catalogue holds the sentence, the tags
  // below are where each language places the links in it.
  const contact = t.rich("contact", {
    email: PRIVACY_EMAIL,
    note: (chunks) => (
      <Link
        href="/privacy?in=tab"
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-ink hover:underline"
      >
        {chunks}
      </Link>
    ),
    hidden: (chunks) => <span className="sr-only">{chunks}</span>,
    address: (chunks) => (
      <a
        href={`mailto:${PRIVACY_EMAIL}`}
        className="font-semibold text-ink hover:underline"
      >
        {chunks}
      </a>
    ),
  });

  return (
    <Card>
      <SectionTitle>{t("title")}</SectionTitle>

      {save.error && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage(save.error)} />
        </div>
      )}

      <div className="mt-6 space-y-4">
        <KeyValue
          label={t("processing")}
          value={t("agreed", {
            date: onDate(data.core_at, locale),
            version: data.core_version,
          })}
        />

        <label className="flex cursor-pointer items-start gap-3 border-t border-hairline pt-4">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
            checked={data.research}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.checked)}
          />
          <span>
            <span className="block">{t("research")}</span>
            <span className="type-caption text-ink-3">
              {data.research
                ? t("researchAgreed", {
                    date: onDate(data.research_at, locale),
                    version: data.research_version ?? "–",
                  })
                : t("researchOptional")}
            </span>
          </span>
        </label>

        <p className="type-caption border-t border-hairline pt-4 text-ink-3">
          {contact}
        </p>
      </div>
    </Card>
  );
}
