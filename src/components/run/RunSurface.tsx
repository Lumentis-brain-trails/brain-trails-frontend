"use client";

/**
 * The participant surface around a running protocol (backend V3-0007, S16 v1).
 *
 * The screen kept awake, a steady recording light, and full screen on request - the
 * things a person wearing the headband needs to trust the run. Full screen is a button,
 * not automatic: entering it in the Start click coincided with the headband dropping in
 * the first real test (2026-09-19), and a run must not depend on it. The wake lock is
 * held while mounted and taken again when the tab comes back, because the browser drops
 * it whenever the page is hidden.
 */
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Enter full screen; resolves false when the browser refuses (the run goes on). */
export async function enterFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

/** Leave full screen if the page holds it. */
export function exitFullscreen(): void {
  if (document.fullscreenElement)
    void document.exitFullscreen().catch(() => {});
}

export function RunSurface({ children }: { children: ReactNode }) {
  const t = useTranslations("run.surface");

  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
    };
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        const lock = await nav.wakeLock.request("screen");
        if (active) sentinel = lock;
        else void lock.release();
      } catch {
        // not allowed (battery saver, unsupported): the run goes on without it
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);

  return (
    <div className="relative min-h-dvh">
      <button
        type="button"
        onClick={() => void enterFullscreen()}
        className="fixed top-4 left-4 z-50 rounded-full bg-surface-2/90 px-3 py-1.5 text-[12px] font-medium text-ink"
      >
        {t("fullscreen")}
      </button>
      <div
        className="pointer-events-none fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-surface-2/90 px-3 py-1.5 text-[12px] font-medium text-ink"
        role="status"
        aria-label={t("recording")}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
        {t("recording")}
      </div>
      {children}
    </div>
  );
}
