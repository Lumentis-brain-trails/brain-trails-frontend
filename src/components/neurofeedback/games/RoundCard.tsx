"use client";

/**
 * The card at the end of a game round (V4-0013): the light as a bar, the choices, the
 * level. No percentage and no comparison with anyone: the bar says how much of the
 * round the path was lit, in the person's own terms. Dim text on the black stage, so
 * its appearance is not a flash.
 */

import { useTranslations } from "next-intl";
import type { RoundCardData } from "./useGameRound";

export function RoundCard({ card }: { card: RoundCardData }) {
  const t = useTranslations("kinds.neurofeedback.lantern.card");
  const levelText =
    card.next > card.level
      ? t("levelUp", { level: card.level, next: card.next })
      : card.next < card.level
        ? t("levelDown", { level: card.level, next: card.next })
        : t("levelSame", { level: card.level });
  return (
    <div
      role="status"
      className="absolute inset-0 flex items-center justify-center px-6"
    >
      <div className="w-full max-w-sm text-center text-ink-2">
        <p className="type-heading text-ink">{t("title")}</p>
        <p className="mt-6 text-[15px]">{t("light")}</p>
        <div
          className="mx-auto mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={Math.round(card.light * 100) / 100}
          aria-label={t("light")}
        >
          <div
            className="h-full rounded-full bg-[rgb(249,196,110)]/60"
            style={{ width: `${Math.round(card.light * 100)}%` }}
          />
        </div>
        <p className="mt-5 text-[15px]">
          {t("choices", { correct: card.correct, total: card.total })}
        </p>
        <p className="mt-2 text-[15px]">{levelText}</p>
      </div>
    </div>
  );
}
