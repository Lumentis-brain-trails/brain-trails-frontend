"use client";

/**
 * Developer overlay for the run-timing probe (`src/lib/timing/probe.ts`).
 *
 * Shown only outside production and only with `?probe=1`, so budgets such as "video
 * onset error p95 < 25 ms" can be watched while a run plays. It feeds the probe from its
 * own `requestAnimationFrame` loop and re-reads it twice a second; it never touches the
 * runner's clock or its markers. Developer-facing, so its labels are not translated.
 */
import { useEffect, useState } from "react";
import {
  pageProbe,
  probeOverlayEnabled,
  type TimingSnapshot,
} from "@/lib/timing/probe";

export function TimingProbeOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<TimingSnapshot | null>(null);

  useEffect(() => {
    setEnabled(
      probeOverlayEnabled(
        process.env.NEXT_PUBLIC_APP_ENV,
        window.location.search
      )
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let frame = requestAnimationFrame(function tick(t) {
      pageProbe.frame(t);
      frame = requestAnimationFrame(tick);
    });
    const timer = window.setInterval(
      () => setSnapshot(pageProbe.snapshot()),
      500
    );
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled || !snapshot) return null;
  const fps =
    snapshot.frameIntervalMs > 0 ? 1000 / snapshot.frameIntervalMs : 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-3 bottom-3 z-50 rounded-md bg-black/70 px-3 py-2 font-mono text-[11px] leading-5 text-white"
    >
      <div>fps {fps.toFixed(0)}</div>
      <div>dropped {snapshot.droppedFrames}</div>
      <div>
        onset p95 {snapshot.onsetErrorP95Ms.toFixed(1)} ms (max{" "}
        {snapshot.maxOnsetErrorMs.toFixed(1)}, n {snapshot.onsets})
      </div>
    </div>
  );
}
