"use client";

/**
 * The beta question, asked once at the end of the first report someone reads.
 *
 * Place it last in a report: it is an invisible marker that opens a sheet when it scrolls
 * into view, but never sooner than `MIN_READ_MS` after the report appeared, so a short
 * report that fits on one screen is still read before it is interrupted. Whether to ask
 * at all is `shouldAskBeta`'s call; showing the sheet marks the question as asked, so
 * "Not now" and closing it both count as an answer.
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui";
import {
  BETA_APPLY_HASH,
  markBetaAsked,
  shouldAskBeta,
} from "@/lib/betaPrompt";

/** Time a report stays on screen before the question can interrupt it. */
const MIN_READ_MS = 15_000;

export function BetaPrompt({ wantsBeta }: { wantsBeta: boolean | null }) {
  const t = useTranslations("beta");
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const node = end.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (!shouldAskBeta(wantsBeta)) return;
    const shownAt = Date.now();
    let timer: number | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const wait = Math.max(0, MIN_READ_MS - (Date.now() - shownAt));
      timer = window.setTimeout(() => {
        markBetaAsked();
        setOpen(true);
      }, wait);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [wantsBeta]);

  return (
    <>
      <div ref={end} aria-hidden data-testid="beta-prompt-marker" />
      {open && (
        <Sheet title={t("promptTitle")} onClose={() => setOpen(false)}>
          <p className="text-pretty text-ink-2">{t("promptText")}</p>
          <p className="type-caption mt-3 text-ink-3">{t("promptLaterHint")}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("promptLater")}
            </Button>
            <Button onClick={() => router.push(`/account${BETA_APPLY_HASH}`)}>
              {t("apply")}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
