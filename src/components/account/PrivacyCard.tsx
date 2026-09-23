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
import Link from "next/link";
import { ApiRequestError, api } from "@/lib/api";
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

function onDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "–";
}

export function PrivacyCard({ data }: { data: ConsentData | undefined }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (research: boolean) => api.put("auth/me/consent", { research }),
    onSuccess: async (_result, research) => {
      toast(
        "success",
        research ? "Thank you - you are contributing." : "Withdrawn."
      );
      await queryClient.invalidateQueries({ queryKey: ["me-consent"] });
    },
  });

  if (!data) return null;

  return (
    <Card>
      <SectionTitle>Privacy and consent</SectionTitle>

      {save.error && (
        <div className="mt-4">
          <ErrorBanner
            message={
              save.error instanceof ApiRequestError
                ? save.error.error.message
                : "Could not save."
            }
          />
        </div>
      )}

      <div className="mt-6 space-y-4">
        <KeyValue
          label="Processing your recordings"
          value={`Agreed on ${onDate(data.core_at)} · version ${data.core_version}`}
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
            <span className="block">
              Contribute my data to broader research.
            </span>
            <span className="type-caption text-ink-3">
              {data.research
                ? `Agreed on ${onDate(data.research_at)} · version ${data.research_version}. Untick to withdraw: we stop using your data for research from then on, though we cannot undo research already done.`
                : "Optional. Your results, your recordings and everything else work exactly the same either way."}
            </span>
          </span>
        </label>

        <p className="type-caption border-t border-hairline pt-4 text-ink-3">
          Read the{" "}
          <Link
            href="/privacy?in=tab"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink hover:underline"
          >
            privacy note
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
          , or write to{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-semibold text-ink hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
          . You can export or delete everything below.
        </p>
      </div>
    </Card>
  );
}
