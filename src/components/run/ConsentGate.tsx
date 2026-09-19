"use client";

/**
 * The pre-flight from a protocol's manifest: content warning, then consent if required.
 *
 * Shown before the headband pre-flight so nobody straps on a headband for a protocol
 * they would not agree to. The texts are protocol content (the author's words, from the
 * manifest) and shown as written; the chrome around them comes from `run.consent`.
 * With neither a warning nor required consent there is nothing to show, and the host
 * should skip the gate - `needsConsentGate` says when.
 */

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button, Card } from "@/components/ui";
import type { ProtocolManifest } from "@/lib/protocol/tree";

export type ConsentManifest = Pick<
  ProtocolManifest,
  "content_warning" | "requires_consent" | "consent_text"
>;

export interface ConsentGateProps {
  manifest: ConsentManifest;
  /** The protocol's title, shown as the heading when given. */
  title?: string;
  /** The participant read the warning and, when required, ticked consent. */
  onAccept: () => void;
  /** Back out; no button is shown when absent. */
  onDecline?: () => void;
}

/** True when the manifest has anything the participant must see before the run. */
export function needsConsentGate(manifest: ConsentManifest): boolean {
  return Boolean(manifest.content_warning) || manifest.requires_consent;
}

export function ConsentGate({
  manifest,
  title,
  onAccept,
  onDecline,
}: ConsentGateProps) {
  const t = useTranslations("run.consent");
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();
  const canContinue = !manifest.requires_consent || agreed;

  return (
    <Card className="mx-auto max-w-xl space-y-5">
      <h1 className="type-title">{title ?? t("title")}</h1>
      {manifest.content_warning && (
        <section
          aria-label={t("warning")}
          className="rounded-[var(--radius-control)] bg-accent-soft px-4 py-3"
        >
          <h2 className="mb-1 text-[13px] font-medium text-ink-2">
            {t("warning")}
          </h2>
          <p className="whitespace-pre-line text-ink">
            {manifest.content_warning}
          </p>
        </section>
      )}
      {manifest.requires_consent && (
        <section aria-label={t("consent")} className="space-y-3">
          <h2 className="text-[13px] font-medium text-ink-2">{t("consent")}</h2>
          {manifest.consent_text && (
            <p className="max-h-64 overflow-y-auto whitespace-pre-line text-ink">
              {manifest.consent_text}
            </p>
          )}
          <div className="flex items-start gap-2">
            <input
              id={checkboxId}
              type="checkbox"
              required
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1"
            />
            <label htmlFor={checkboxId} className="text-[14px] text-ink">
              {t("agree")}
            </label>
          </div>
        </section>
      )}
      <div className="flex items-center justify-end gap-3">
        {onDecline && (
          <Button variant="ghost" onClick={onDecline}>
            {t("decline")}
          </Button>
        )}
        <Button onClick={onAccept} disabled={!canContinue}>
          {t("accept")}
        </Button>
      </div>
      {!canContinue && (
        <p className="type-caption text-right text-ink-3">{t("required")}</p>
      )}
    </Card>
  );
}
