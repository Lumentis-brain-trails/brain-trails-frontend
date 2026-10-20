"use client";

/**
 * The findings of a check, each pointing at its clip.
 *
 * One list for the server's report (Check, Publish) and the builder's own (Preview,
 * Publish): a finding says which block, which setting, and what to change, and clicking
 * it selects the block so the inspector shows the field. Paths are the server's
 * (`root/<clip>/config/<field>`), read by `locate`.
 *
 * What a finding says is the server's English as it arrives, or, for a finding the
 * builder made itself, that sentence in the reader's language (`finding.text`).
 */

import { useTranslations } from "next-intl";
import { type Finding, locate } from "@/lib/builder/findings";

export function FindingsList({
  errors,
  warnings = [],
  labels,
  onLocate,
}: {
  errors: Finding[];
  warnings?: Finding[];
  /** The clips' names, by timeline index. */
  labels: string[];
  /** Select the clip a finding is about; absent, findings are plain text. */
  onLocate?: (clip: number) => void;
}) {
  const t = useTranslations("builder");
  const place = (finding: Finding) => {
    const { clip, where, rows } = locate(finding.path);
    const parts = [
      clip === null
        ? t("finding_protocol")
        : t("finding_block", { n: clip + 1, label: labels[clip] ?? "" }),
      ...rows.map((n) => t("finding_row", { n })),
      ...(where ? [where] : []),
    ];
    return { clip, text: parts.join(" · ") };
  };
  const say = (finding: Finding) => {
    const key = finding.text ? `findingText.${finding.text.key}` : null;
    return key && finding.text && t.has(key as never)
      ? t(key as never, finding.text.values as never)
      : finding.message;
  };
  return (
    <ul className="space-y-1 text-[14px]">
      {errors.map((finding, index) => {
        const { clip, text } = place(finding);
        const head =
          clip !== null && onLocate ? (
            <button
              type="button"
              className="font-medium text-accent underline-offset-2 hover:underline"
              onClick={() => onLocate(clip)}
            >
              {text}
            </button>
          ) : (
            <span className="font-medium">{text}</span>
          );
        return (
          <li key={`e${index}`} className="text-danger">
            {head}
            <span className="text-ink-3"> — </span>
            {say(finding)}
          </li>
        );
      })}
      {warnings.map((finding, index) => {
        const { text } = place(finding);
        return (
          <li key={`w${index}`} className="text-warn">
            <span className="font-medium">{text}</span>
            <span className="text-ink-3"> — </span>
            {say(finding)}
          </li>
        );
      })}
    </ul>
  );
}
