import { describe, expect, it } from "vitest";
import {
  DEFAULT_EPSILON,
  type LayerSource,
  type LayerSpec,
  blurGrid,
  computeLayer,
  defaultThreshold,
  isFrequency,
  layerTasks,
  reviveLayers,
  shade,
} from "./landscapeLayers";

/** A 21 x 21 map over [0, 20] (one unit per cell), blur width 1. */
function source(overrides: Partial<LayerSource> = {}): LayerSource {
  return {
    version: 1,
    epoch: 1,
    pending: false,
    stale: false,
    bounds: [0, 20, 0, 20],
    sigma: 1,
    nx: 21,
    ny: 21,
    runs: [
      // task A twice: once sitting at (5, 5), once at (15, 15)
      { task: "A", dt: 1, x: [5, 5, 5, 5], y: [5, 5, 5, 5] },
      { task: "A", dt: 1, x: [15, 15], y: [15, 15] },
      { task: "B", dt: 0.5, x: [5, 30], y: [15, 30] },
    ],
    labels: [
      {
        key: "anxiety",
        instrument: "custom",
        item: "anxiety",
        text: "How anxious?",
        scale: [0, 10],
      },
      {
        key: "mood",
        instrument: "custom",
        item: "mood",
        text: null,
        scale: null,
      },
    ],
    answers: [
      [0, 0, 0.8, 8],
      [1, 0, 0.2, 2],
      [1, 0, 0.4, 4], // two answers on one run: averaged to 3
      [2, 1, 0.5, 5],
    ],
    ...overrides,
  };
}

function spec(change: Partial<LayerSpec>): LayerSpec {
  return {
    id: "l",
    kind: "time",
    color: "#2a78d6",
    visible: true,
    energy: false,
    epsilon: DEFAULT_EPSILON,
    cutoff: null,
    ...change,
  };
}

describe("blurGrid", () => {
  it("counts one window as 1 on its own cell and spreads it by the width", () => {
    const data = new Float64Array(21 * 21);
    data[10 * 21 + 10] = 1;
    const out = blurGrid(data, 21, 21, 2, 2);
    expect(out[10 * 21 + 10]).toBeCloseTo(1, 1);
    expect(out[10 * 21 + 12]).toBeCloseTo(Math.exp(-0.5), 1);
    expect(out[0]).toBeLessThan(1e-3);
  });

  it("leaves the data alone without a width", () => {
    const data = Float64Array.of(1, 2, 3, 4);
    expect([...blurGrid(data, 2, 2, 0, 0)]).toEqual([1, 2, 3, 4]);
  });
});

describe("computeLayer", () => {
  it("time: seconds near a place per run of the task, peaking at 1 when drawn", () => {
    const field = computeLayer(source(), spec({ kind: "time", task: "A" }))!;
    expect(field.unit).toBe("seconds");
    // run 1 sat four seconds at (5, 5); averaged over two runs
    expect(field.value[5][5]).toBeCloseTo(2, 1);
    expect(field.value[15][15]).toBeCloseTo(1, 1);
    expect(field.z[5][5]).toBeCloseTo(1, 5);
    expect(field.value[0][19]).toBeCloseTo(0, 3);
    // empty ground is not drawn: no flat sheet over the map
    expect(field.z[0][19]).toBeNull();
  });

  it("reach: the share of the task's runs that came near each place", () => {
    const field = computeLayer(source(), spec({ kind: "reach", task: "A" }))!;
    expect(field.unit).toBe("reach");
    expect(field.value[5][5]).toBeCloseTo(0.5, 5);
    expect(field.value[15][15]).toBeCloseTo(0.5, 5);
    expect(field.value[5][6]).toBeCloseTo(0.5 * Math.exp(-0.5), 5);
    expect(field.value[10][10]).toBeCloseTo(0, 5);
  });

  it("windows off the map are left out, not piled on its edge", () => {
    const field = computeLayer(source(), spec({ kind: "time", task: "B" }))!;
    expect(field.value[20][20]).toBeCloseTo(0, 5);
    expect(field.value[15][5]).toBeCloseTo(0.5, 1);
  });

  it("value: the average answer near a place, on the label's scale, blank where none", () => {
    const field = computeLayer(
      source(),
      spec({ kind: "value", label: "anxiety" })
    )!;
    expect(field.unit).toBe("answer");
    expect(field.value[5][5]).toBeCloseTo(8, 3);
    expect(field.value[15][15]).toBeCloseTo(3, 3);
    expect(field.z[5][5]).toBeCloseTo(0.8, 3);
    expect(field.value[10][10]).toBeNull();
    expect(field.z[0][0]).toBeNull();
  });

  it("threshold: how often the answer near a place was above or below it", () => {
    const above = computeLayer(
      source(),
      spec({ kind: "threshold", label: "anxiety", threshold: 5 })
    )!;
    expect(above.value[5][5]).toBeCloseTo(1, 5);
    expect(above.value[15][15]).toBeCloseTo(0, 5);
    const below = computeLayer(
      source(),
      spec({
        kind: "threshold",
        label: "anxiety",
        threshold: 5,
        direction: "below",
      })
    )!;
    expect(below.value[15][15]).toBeCloseTo(1, 5);
    // without a threshold, the middle of the scale; without a scale, normalised
    const mood = computeLayer(
      source(),
      spec({ kind: "threshold", label: "mood", threshold: 0.4 })
    )!;
    expect(mood.value[15][5]).toBeCloseTo(1, 5);
  });

  it("energy: -log(p + epsilon), capped at the cutoff, scaled by its ceiling", () => {
    const reach = spec({
      kind: "reach",
      task: "A",
      energy: true,
      epsilon: 0.01,
    });
    const field = computeLayer(source(), reach)!;
    expect(field.unit).toBe("energy");
    expect(field.value[5][5]).toBeCloseTo(-Math.log(0.51), 5);
    expect(field.value[10][10]).toBeCloseTo(-Math.log(0.01), 3);
    expect(field.z[10][10]).toBeCloseTo(1, 3);
    const capped = computeLayer(source(), { ...reach, cutoff: 2 })!;
    expect(capped.value[10][10]).toBe(2);
    expect(capped.z[10][10]).toBe(1);
    expect(capped.z[5][5]).toBeCloseTo(-Math.log(0.51) / 2, 5);
    // time's p is the share of a run's time; a threshold's energy keeps its blanks
    const time = computeLayer(
      source(),
      spec({ kind: "time", task: "A", energy: true })
    )!;
    expect(time.value[5][5]).toBeLessThan(time.value[10][10]!);
    const threshold = computeLayer(
      source(),
      spec({ kind: "threshold", label: "anxiety", energy: true, epsilon: -1 })
    )!;
    expect(threshold.value[10][10]).toBeNull();
    expect(threshold.value[5][5]).toBeCloseTo(
      -Math.log(1 + DEFAULT_EPSILON),
      5
    );
  });

  it("a value layer has no energy view", () => {
    const field = computeLayer(
      source(),
      spec({ kind: "value", label: "anxiety", energy: true })
    )!;
    expect(field.unit).toBe("answer");
  });

  it("returns null for a task or label the person no longer has", () => {
    expect(
      computeLayer(source(), spec({ kind: "time", task: "Z" }))
    ).toBeNull();
    expect(
      computeLayer(source(), spec({ kind: "value", label: "z" }))
    ).toBeNull();
    expect(
      computeLayer(
        source({ answers: [] }),
        spec({ kind: "value", label: "anxiety" })
      )
    ).toBeNull();
  });
});

describe("helpers", () => {
  it("lists tasks in first-seen order", () => {
    expect(layerTasks(source())).toEqual(["A", "B"]);
    expect(
      layerTasks(source({ runs: [{ task: null, dt: 1, x: [], y: [] }] }))
    ).toEqual([]);
  });

  it("starts a threshold mid-scale", () => {
    expect(defaultThreshold(source().labels[0])).toBe(5);
    expect(defaultThreshold(source().labels[1])).toBe(0.5);
  });

  it("knows which kinds are frequencies", () => {
    expect(isFrequency("time")).toBe(true);
    expect(isFrequency("value")).toBe(false);
  });

  it("darkens a colour, and leaves anything else alone", () => {
    expect(shade("#ffffff", 0.5)).toBe("#808080");
    expect(shade("red", 0.5)).toBe("red");
  });
});

describe("reviveLayers", () => {
  it("keeps what still applies and repairs what it can", () => {
    const kept = reviveLayers(
      [
        spec({ id: "a", kind: "time", task: "A" }),
        { ...spec({ id: "b", kind: "value", label: "anxiety" }), energy: true },
        {
          ...spec({ id: "c", kind: "reach", task: "A" }),
          epsilon: -2,
          cutoff: 0,
        },
        spec({ id: "d", kind: "time", task: "gone" }),
        spec({ id: "e", kind: "threshold", label: "gone" }),
        { ...spec({ id: "f" }), color: "javascript:alert(1)" },
        { ...spec({ id: "g" }), kind: "nope" },
        null,
        "x",
      ],
      source()
    );
    expect(kept.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(kept[1].energy).toBe(false);
    expect(kept[2].epsilon).toBe(DEFAULT_EPSILON);
    expect(kept[2].cutoff).toBeNull();
  });

  it("reads nothing from something that is not a list", () => {
    expect(reviveLayers({}, source())).toEqual([]);
  });
});
