import { describe, expect, test } from "vitest";
import type { BlockMetrics } from "./rows";
import {
  type Selection,
  WHOLE_BLOCK,
  focusedBlock,
  isNarrowed,
  keptWindows,
  selectionQuery,
  toggleLabel,
} from "./selection";

const block = { t_start_s: 60, t_end_s: 180 };

const row = {
  block_id: "dock",
  key: "dock#0",
  t_start_s: 60,
  t_end_s: 180,
  bands: { alpha: 0.3 },
  labels: ["cargo_pressed", "debris_held"],
  dynamics: null,
  behaviour: { accuracy: 0.8 },
  norm: { n_people: 12, accuracy: 0.7 },
} as unknown as BlockMetrics;

describe("the query", () => {
  test("names the block, and the range and labels only when narrowed", () => {
    expect(selectionQuery("dock#0", WHOLE_BLOCK)).toBe("block=dock%230");
    expect(
      selectionQuery("dock#0", {
        range: [70, 90],
        labels: ["cargo_pressed", "debris_held"],
      })
    ).toBe(
      "block=dock%230&start=70&end=90&labels=cargo_pressed&labels=debris_held"
    );
  });
});

describe("which windows a focus keeps", () => {
  const t = [60, 61, 62, 63];
  const labels = ["cargo_pressed", null, "debris_held", "cargo_pressed"];

  test("the whole block keeps every window", () => {
    expect(keptWindows(t, labels, block, WHOLE_BLOCK)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  test("a range is half-open, like the backend's", () => {
    expect(
      keptWindows(t, labels, block, { range: [61, 63], labels: null })
    ).toEqual([false, true, true, false]);
  });

  test("a label filter drops the unlabelled windows too", () => {
    expect(
      keptWindows(t, labels, block, { range: null, labels: ["cargo_pressed"] })
    ).toEqual([true, false, false, true]);
  });
});

describe("the block the rows read", () => {
  const selection = {
    block_key: "dock#0",
    t_start_s: 70,
    t_end_s: 90,
    window_t: [],
    window_labels: ["cargo_pressed"],
    n_windows: 20,
    bands: { alpha: 0.5 },
    dynamics: null,
    behaviour: { accuracy: 1 },
    regions: "person",
  } as unknown as Selection;

  test("takes the selection's numbers and bounds", () => {
    const focus = { range: [70, 90] as [number, number], labels: null };
    const out = focusedBlock(row, focus, selection);
    expect(out.bands.alpha).toBe(0.5);
    expect(out.behaviour?.accuracy).toBe(1);
    expect([out.t_start_s, out.t_end_s]).toEqual([70, 90]);
  });

  test("keeps the average person for the whole block only", () => {
    expect(focusedBlock(row, WHOLE_BLOCK, undefined).norm).toEqual(row.norm);
    expect(
      focusedBlock(row, { range: null, labels: ["cargo_pressed"] }, selection)
        .norm
    ).toBeNull();
  });

  test("keeps the stored numbers until the selection arrives", () => {
    expect(focusedBlock(row, WHOLE_BLOCK, undefined).bands.alpha).toBe(0.3);
  });
});

describe("toggling labels", () => {
  const all = ["cargo_pressed", "cargo_held", "debris_held"];

  test("switching one off keeps the others, switching it back clears the filter", () => {
    const off = toggleLabel(WHOLE_BLOCK, "cargo_held", all);
    expect(off.labels).toEqual(["cargo_pressed", "debris_held"]);
    expect(toggleLabel(off, "cargo_held", all).labels).toBeNull();
  });

  test("is narrowing, as a range is", () => {
    expect(isNarrowed(block, WHOLE_BLOCK)).toBe(false);
    expect(isNarrowed(block, { range: [60, 180], labels: null })).toBe(false);
    expect(isNarrowed(block, { range: [61, 180], labels: null })).toBe(true);
    expect(isNarrowed(block, toggleLabel(WHOLE_BLOCK, "cargo_held", all))).toBe(
      true
    );
  });
});
