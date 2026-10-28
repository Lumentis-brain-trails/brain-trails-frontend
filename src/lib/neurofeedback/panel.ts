/**
 * What the console's neurofeedback panel shows, folded from the runner's markers
 * (V4-0009).
 *
 * The console never computes feedback itself: it reads the `nf_*` events the block in
 * the participant's window logs, exactly as they are recorded, so the operator sees what
 * the person sees and what the session will say. The same fold serves the remote console
 * (T5), whose markers come from the live service instead of the channel.
 */

import type { Marker } from "@/lib/protocol/marker";

export interface NfPanel {
  stepId: string | null;
  phase: "baseline" | "training" | null;
  value: number | null;
  smoothed: number | null;
  threshold: number | null;
  inTarget: boolean | null;
  gated: string | null;
  brightness: number | null;
  ageMs: number | null;
  /** Training updates so far, and how many were in target or gated. */
  training: number;
  inTargetCount: number;
  gatedCount: number;
  nudges: number;
  /** The block's last word when it ended early or lost the headband. */
  alert: "baseline_failed" | "baseline_extended" | "signal_lost" | null;
}

export const EMPTY_PANEL: NfPanel = {
  stepId: null,
  phase: null,
  value: null,
  smoothed: null,
  threshold: null,
  inTarget: null,
  gated: null,
  brightness: null,
  ageMs: null,
  training: 0,
  inTargetCount: 0,
  gatedCount: 0,
  nudges: 0,
  alert: null,
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The panel after one more marker; markers that are not `nf_*` leave it as it was. */
export function foldPanel(panel: NfPanel, marker: Marker): NfPanel {
  if (!marker.label.startsWith("nf_")) return panel;
  const meta = (marker.meta ?? {}) as Record<string, unknown>;
  const stepId = typeof meta.step_id === "string" ? meta.step_id : null;
  // a new block starts from nothing
  const base = stepId !== panel.stepId ? { ...EMPTY_PANEL, stepId } : panel;
  switch (marker.label) {
    case "nf_update": {
      const phase = meta.phase === "baseline" ? "baseline" : "training";
      const training = phase === "training";
      const inTarget =
        typeof meta.in_target === "boolean" ? meta.in_target : null;
      const gated = typeof meta.gated === "string" ? meta.gated : null;
      return {
        ...base,
        phase,
        value: num(meta.value),
        smoothed: num(meta.smoothed),
        threshold: num(meta.threshold),
        inTarget,
        gated,
        brightness: num(meta.brightness),
        ageMs: num(meta.age_ms),
        training: base.training + (training ? 1 : 0),
        inTargetCount: base.inTargetCount + (training && inTarget ? 1 : 0),
        gatedCount: base.gatedCount + (training && gated ? 1 : 0),
        alert: base.alert === "signal_lost" ? null : base.alert,
      };
    }
    case "nf_threshold":
      return {
        ...base,
        threshold: num(meta.threshold),
        nudges: base.nudges + (meta.cause === "operator" ? 1 : 0),
      };
    case "nf_baseline_end":
      return { ...base, alert: null };
    case "nf_baseline_extended":
      return { ...base, alert: "baseline_extended" };
    case "nf_baseline_failed":
      return { ...base, alert: "baseline_failed" };
    case "nf_signal_lost":
      return { ...base, alert: "signal_lost" };
    case "nf_signal_back":
      return { ...base, alert: null };
    default:
      return base;
  }
}

/** Share of the training's clean updates that were in target; null before any. */
export function timeInTarget(panel: NfPanel): number | null {
  const clean = panel.training - panel.gatedCount;
  return clean > 0 ? panel.inTargetCount / clean : null;
}

/** `nf_update` arrives ten times a second: the event ticker leaves it out. */
export function isTickerMarker(marker: Marker): boolean {
  return marker.label !== "nf_update";
}
