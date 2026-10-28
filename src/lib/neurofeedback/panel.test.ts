import { describe, expect, test } from "vitest";
import type { Marker } from "@/lib/protocol/marker";
import { EMPTY_PANEL, foldPanel, isTickerMarker, timeInTarget } from "./panel";

const marker = (label: string, meta: Record<string, unknown> = {}): Marker => ({
  label,
  kind: "stage",
  tSessionS: 1,
  tMonotonicMs: 1,
  tRunMs: 1,
  seq: 0,
  meta: { step_id: "nf", ...meta },
});

describe("foldPanel", () => {
  test("follows updates, thresholds and the operator's nudges", () => {
    let panel = EMPTY_PANEL;
    for (const m of [
      marker("nf_update", {
        phase: "baseline",
        value: 0.1,
        smoothed: 0.1,
        in_target: null,
      }),
      marker("nf_threshold", { threshold: 0.2, cause: "baseline" }),
      marker("nf_update", {
        phase: "training",
        value: 0.3,
        smoothed: 0.25,
        threshold: 0.2,
        in_target: true,
        brightness: 0.8,
        age_ms: 60,
      }),
      marker("nf_update", {
        phase: "training",
        value: null,
        smoothed: 0.25,
        threshold: 0.2,
        in_target: null,
        gated: "muscle",
      }),
      marker("nf_update", {
        phase: "training",
        value: 0.1,
        smoothed: 0.19,
        threshold: 0.2,
        in_target: false,
      }),
      marker("nf_threshold", { threshold: 0.19, cause: "operator" }),
      marker("block_end"),
    ])
      panel = foldPanel(panel, m);
    expect(panel).toMatchObject({
      phase: "training",
      threshold: 0.19,
      inTarget: false,
      training: 3,
      inTargetCount: 1,
      gatedCount: 1,
      nudges: 1,
    });
    expect(timeInTarget(panel)).toBe(0.5);
  });

  test("a new block starts from nothing; alerts come and go", () => {
    let panel = foldPanel(
      EMPTY_PANEL,
      marker("nf_update", { phase: "training", in_target: true })
    );
    panel = foldPanel(panel, marker("nf_signal_lost"));
    expect(panel.alert).toBe("signal_lost");
    panel = foldPanel(panel, marker("nf_signal_back"));
    expect(panel.alert).toBeNull();
    panel = foldPanel(panel, marker("nf_baseline_failed", { step_id: "nf2" }));
    expect(panel).toMatchObject({
      stepId: "nf2",
      training: 0,
      alert: "baseline_failed",
    });
    expect(foldPanel(panel, marker("nf_baseline_extended")).alert).toBe(
      "baseline_extended"
    );
    expect(timeInTarget(EMPTY_PANEL)).toBeNull();
  });

  test("the ticker leaves the updates out", () => {
    expect(isTickerMarker(marker("nf_update"))).toBe(false);
    expect(isTickerMarker(marker("nf_threshold"))).toBe(true);
  });
});
