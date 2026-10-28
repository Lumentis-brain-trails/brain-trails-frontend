"use client";

/**
 * The pre-flight from a protocol's manifest: the photosensitivity warning for a protocol
 * with visual blocks, the content warning, then consent if required.
 *
 * The photosensitivity warning (backend `app/protocols/photosensitivity.py`, hazard H4)
 * is ours, not the author's: the backend says when a protocol needs it
 * (`ProtocolDetail.photosensitive`), the words come from `run.photosensitivity`, and
 * the box must be ticked before Continue. The host then starts the session with
 * `acknowledged: ["photosensitivity"]`, which the backend requires and writes into the
 * session's timeline.
 *
 * Shown before the headband pre-flight so nobody straps on a headband for a protocol
 * they would not agree to. The texts are protocol content (the author's words, from the
 * manifest) and shown as handed in: the host passes an official protocol's manifest and
 * title through `lib/protocol/official.ts` first, and anyone else's as stored. The
 * chrome around them comes from `run.consent`.
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
  /** The protocol shows flashing, high-contrast or moving stimuli (backend H4). */
  photosensitive?: boolean;
  /** The participant read the warning and, when required, ticked consent. */
  onAccept: () => void;
  /** Back out; no button is shown when absent. */
  onDecline?: () => void;
}

/** True when there is anything the participant must see before the run. */
export function needsConsentGate(
  manifest: ConsentManifest,
  photosensitive = false
): boolean {
  return (
    photosensitive ||
    Boolean(manifest.content_warning) ||
    manifest.requires_consent
  );
}

export function ConsentGate({
  manifest,
  title,
  photosensitive = false,
  onAccept,
  onDecline,
}: ConsentGateProps) {
  const t = useTranslations("run.consent");
  const tFlash = useTranslations("run.photosensitivity");
  const [agreed, setAgreed] = useState(false);
  const [warned, setWarned] = useState(false);
  const checkboxId = useId();
  const warnedId = useId();
  const canContinue =
    (!manifest.requires_consent || agreed) && (!photosensitive || warned);

  return (
    <Card className="mx-auto max-w-xl space-y-5">
      <h1 className="type-title">{title ?? t("title")}</h1>
      {photosensitive && (
        <section
          aria-label={tFlash("title")}
          role="alert"
          className="space-y-3 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3"
        >
          <h2 className="text-[13px] font-medium text-ink">
            {tFlash("title")}
          </h2>
          <p className="text-ink">{tFlash("body")}</p>
          <p className="text-ink-2">{tFlash("stop")}</p>
          <div className="flex items-start gap-2">
            <input
              id={warnedId}
              type="checkbox"
              required
              checked={warned}
              onChange={(event) => setWarned(event.target.checked)}
              className="mt-1"
            />
            <label htmlFor={warnedId} className="text-[14px] text-ink">
              {tFlash("agree")}
            </label>
          </div>
        </section>
      )}
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
