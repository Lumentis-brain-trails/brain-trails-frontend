import { describe, expect, it } from "vitest";
import {
  DEFAULT_EPSILON,
  type LayerSource,
  type MeasureField,
  type MeasureSpec,
  blurGrid,
  computeMeasure,
  defaultThreshold,
  defaultView,
  isFrequency,
  layerTasks,
  measure,
  reviveViews,
  taskMetrics,
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
      {
        task: "A",
        dt: 1,
        x: [5, 5, 5, 5],
        y: [5, 5, 5, 5],
        score: { accuracy: 0.9, d_prime: null, rt_ms: 400 },
      },
      {
        task: "A",
        dt: 1,
        x: [15, 15],
        y: [15, 15],
        score: { accuracy: 0.5, d_prime: null, rt_ms: 600 },
      },
      { task: "B", dt: 0.5, x: [5, 30], y: [15, 30] },
    ],
    bands: {
      names: ["alpha", "beta"],
      x: [5, 5, 15, 15, 40],
      y: [5, 5, 15, 15, 40],
      values: [
        [0.4, 0.4, 0.1, null, 0.9],
        [0.2, 0.2, 0.3, 0.3, 0.2],
      ],
    },
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

function spec(change: Partial<MeasureSpec>): MeasureSpec {
  return measure(change.kind ?? "time", change);
}

/** A flat map peaking at 1 in the middle: the map's own height grid. */
const MAP = Array.from({ length: 21 }, (_, j) =>
  Array.from({ length: 21 }, (_, i) => (i === 10 && j === 10 ? 1 : 0.25))
);

function compute(source: LayerSource, change: Partial<MeasureSpec>) {
  return computeMeasure(source, MAP, spec(change));
}

function continuous(field: MeasureField | null) {
  if (!field || field.type !== "continuous") throw new Error("not continuous");
  return field;
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

describe("computeMeasure", () => {
  it("map: the map's own height, and its energy", () => {
    const field = continuous(compute(source(), { kind: "map" }));
    expect(field.unit).toBe("density");
    expect(field.z[10][10]).toBe(1);
    expect(field.value[0][0]).toBe(0.25);
    const energy = continuous(
      compute(source(), { kind: "map", energy: true, epsilon: 0.01 })
    );
    expect(energy.value[10][10]).toBeCloseTo(-Math.log(1.01), 5);
    expect(energy.value[0][0]).toBeCloseTo(-Math.log(0.26), 5);
  });

  it("time: seconds near a place per run of the task, peaking at 1 when drawn", () => {
    const field = continuous(compute(source(), { kind: "time", task: "A" }));
    expect(field.unit).toBe("seconds");
    // run 1 sat four seconds at (5, 5); averaged over two runs
    expect(field.value[5][5]).toBeCloseTo(2, 1);
    expect(field.value[15][15]).toBeCloseTo(1, 1);
    expect(field.z[5][5]).toBeCloseTo(1, 5);
    expect(field.value[0][19]).toBeCloseTo(0, 3);
    // empty ground is not drawn: no flat sheet over the map
    expect(field.z[0][19]).toBeCloseTo(0, 3);
  });

  it("reach: the share of the task's runs that came near each place", () => {
    const field = continuous(compute(source(), { kind: "reach", task: "A" }));
    expect(field.unit).toBe("reach");
    expect(field.value[5][5]).toBeCloseTo(0.5, 5);
    expect(field.value[15][15]).toBeCloseTo(0.5, 5);
    expect(field.value[5][6]).toBeCloseTo(0.5 * Math.exp(-0.5), 5);
    expect(field.value[10][10]).toBeCloseTo(0, 5);
  });

  it("windows off the map are left out, not piled on its edge", () => {
    const field = continuous(compute(source(), { kind: "time", task: "B" }));
    expect(field.value[20][20]).toBeCloseTo(0, 5);
    expect(field.value[15][5]).toBeCloseTo(0.5, 1);
  });

  it("share: of the task time near a place, the share in one task", () => {
    const a = continuous(compute(source(), { kind: "share", task: "A" }));
    expect(a.unit).toBe("share");
    expect(a.value[5][5]).toBeCloseTo(1, 3);
    // B's one window at (5, 15) is the only time there
    expect(a.value[15][5]).toBeCloseTo(0, 3);
    expect(a.value[0][19]).toBeNull();
    const b = continuous(compute(source(), { kind: "share", task: "B" }));
    expect(b.value[15][5]).toBeCloseTo(1, 3);
    const energy = continuous(
      compute(source(), { kind: "share", task: "A", energy: true })
    );
    expect(energy.unit).toBe("energy");
    expect(energy.value[0][19]).toBeNull();
  });

  it("score: the average score of the task's runs near each place", () => {
    const field = continuous(
      compute(source(), { kind: "score", task: "A", metric: "accuracy" })
    );
    expect(field.unit).toBe("accuracy");
    expect(field.value[5][5]).toBeCloseTo(0.9, 3);
    expect(field.value[15][15]).toBeCloseTo(0.5, 3);
    expect(field.value[0][19]).toBeNull();
    const rt = continuous(
      compute(source(), { kind: "score", task: "A", metric: "rt_ms" })
    );
    expect(rt.unit).toBe("ms");
    expect(rt.value[15][15]).toBeCloseTo(600, 1);
    // drawn over its own range: the best place highest, the worst on the floor
    expect(field.z[5][5]).toBeGreaterThan(field.z[15][15]);
    // a task never scored has nothing to show
    expect(
      compute(source(), { kind: "score", task: "B", metric: "accuracy" })
    ).toBeNull();
    expect(
      compute(source(), { kind: "score", task: "A", metric: "d_prime" })
    ).toBeNull();
  });

  it("band: the average power of the windows near each place, blanks skipped", () => {
    const alpha = continuous(
      compute(source(), { kind: "band", band: "alpha" })
    );
    expect(alpha.unit).toBe("band");
    expect(alpha.value[5][5]).toBeCloseTo(0.4, 3);
    // one window at (15, 15) had no usable channel: the other one alone speaks
    expect(alpha.value[15][15]).toBeCloseTo(0.1, 3);
    expect(alpha.value[0][19]).toBeNull();
    expect(compute(source(), { kind: "band", band: "gamma" })).toBeNull();
    expect(
      compute(source({ bands: undefined }), { kind: "band", band: "alpha" })
    ).toBeNull();
  });

  it("main: the task with the most time near each place", () => {
    const field = compute(source(), { kind: "main" });
    if (!field || field.type !== "categorical") throw new Error("categorical");
    expect(field.categories).toEqual(["A", "B"]);
    expect(field.category[5][5]).toBe(0);
    expect(field.category[15][5]).toBe(1);
    expect(field.share[5][5]).toBeCloseTo(1, 3);
    expect(field.category[0][19]).toBeNull();
    expect(compute(source({ runs: [] }), { kind: "main" })).toBeNull();
  });

  it("main: chooses only among the tasks shown, colours kept by task", () => {
    const field = compute(source(), { kind: "main", tasks: ["B"] });
    if (!field || field.type !== "categorical") throw new Error("categorical");
    expect(field.categories).toEqual(["A", "B"]);
    expect(field.shown).toEqual([1]);
    // only B's windows count: A's place is unknown, B's is B's alone
    expect(field.category[5][5]).toBeNull();
    expect(field.category[15][5]).toBe(1);
    expect(field.weights[0][15][5]).toBe(0);
    expect(field.weights[1][15][5]).toBeCloseTo(1, 6);
    // naming no task the person has is every task
    const all = compute(source(), { kind: "main", tasks: ["gone"] });
    if (!all || all.type !== "categorical") throw new Error("categorical");
    expect(all.shown).toEqual([0, 1]);
    expect(all.weights[0][5][5]).toBeCloseTo(1, 3);
  });

  it("blur: averages over a wider kernel, the extra width in map widths", () => {
    const sharp = continuous(
      compute(source(), { kind: "band", band: "alpha" })
    );
    const soft = continuous(
      compute(source(), { kind: "band", band: "alpha", smooth: 3 })
    );
    // farther from the windows, the blurred average still knows something
    expect(sharp.value[10][5]).toBeNull();
    expect(soft.value[10][5]).not.toBeNull();
    // and the two places' averages draw closer to each other
    const gap = (f: typeof sharp) =>
      (f.value[5][5] ?? 0) - (f.value[15][15] ?? 0);
    expect(gap(soft)).toBeLessThan(gap(sharp));
    expect(soft.support?.[10][5]).toBeGreaterThan(sharp.support?.[10][5] ?? 0);
    // the map is the map: no blur of its own
    expect(compute(source(), { kind: "map", smooth: 3 })).toEqual(
      compute(source(), { kind: "map" })
    );
  });

  it("value: the average answer near a place, on the label's scale, blank where none", () => {
    const field = continuous(
      compute(source(), { kind: "value", label: "anxiety" })
    );
    expect(field.unit).toBe("answer");
    expect(field.value[5][5]).toBeCloseTo(8, 3);
    expect(field.value[15][15]).toBeCloseTo(3, 3);
    // drawn softened: it slopes down from the answer (0.8) instead of standing as a wall
    expect(field.z[5][5]).toBeGreaterThan(0.5);
    expect(field.z[5][5]).toBeLessThan(0.8);
    expect(field.z[5][7]).toBeLessThan(field.z[5][5]);
    expect(field.value[10][10]).toBeNull();
    // no answer there: the hover is blank and the measure lies on the floor
    expect(field.z[0][0]).toBeCloseTo(0, 3);
  });

  it("threshold: how often the answer near a place was above or below it", () => {
    const above = continuous(
      compute(source(), { kind: "threshold", label: "anxiety", threshold: 5 })
    );
    expect(above.value[5][5]).toBeCloseTo(1, 5);
    expect(above.value[15][15]).toBeCloseTo(0, 5);
    const below = continuous(
      compute(source(), {
        kind: "threshold",
        label: "anxiety",
        threshold: 5,
        direction: "below",
      })
    );
    expect(below.value[15][15]).toBeCloseTo(1, 5);
    // without a scale, normalised
    const mood = continuous(
      compute(source(), { kind: "threshold", label: "mood", threshold: 0.4 })
    );
    expect(mood.value[15][5]).toBeCloseTo(1, 5);
  });

  it("energy: -log(p + epsilon), capped at the cutoff, scaled by its ceiling", () => {
    const reach = {
      kind: "reach" as const,
      task: "A",
      energy: true,
      epsilon: 0.01,
    };
    const field = continuous(compute(source(), reach));
    expect(field.unit).toBe("energy");
    expect(field.value[5][5]).toBeCloseTo(-Math.log(0.51), 5);
    expect(field.value[10][10]).toBeCloseTo(-Math.log(0.01), 3);
    expect(field.z[10][10]).toBeCloseTo(1, 3);
    const capped = continuous(compute(source(), { ...reach, cutoff: 2 }));
    expect(capped.value[10][10]).toBe(2);
    expect(capped.z[10][10]).toBe(1);
    expect(capped.z[5][5]).toBeCloseTo(-Math.log(0.51) / 2, 5);
    // time's p is the share of a run's time; a threshold's energy keeps its blanks
    const time = continuous(
      compute(source(), { kind: "time", task: "A", energy: true })
    );
    expect(time.value[5][5]).toBeLessThan(time.value[10][10]!);
    const threshold = continuous(
      compute(source(), {
        kind: "threshold",
        label: "anxiety",
        energy: true,
        epsilon: -1,
      })
    );
    expect(threshold.value[10][10]).toBeNull();
    expect(threshold.value[5][5]).toBeCloseTo(
      -Math.log(1 + DEFAULT_EPSILON),
      5
    );
  });

  it("log height: log(1 + p / epsilon) over its ceiling, values kept", () => {
    const plain = continuous(compute(source(), { kind: "map" }));
    const lifted = continuous(
      compute(source(), { kind: "map", log: true, epsilon: 0.01 })
    );
    expect(lifted.value).toEqual(plain.value);
    expect(lifted.z[10][10]).toBeCloseTo(1, 6);
    // the flat ground at 0.25 rises well above a quarter of the peak
    expect(lifted.z[0][0]).toBeCloseTo(Math.log1p(25) / Math.log1p(100), 6);
    expect(lifted.z[0][0]).toBeGreaterThan(plain.z[0][0]);
  });

  it("an average has no energy view", () => {
    const field = continuous(
      compute(source(), { kind: "value", label: "anxiety", energy: true })
    );
    expect(field.unit).toBe("answer");
  });

  it("returns null for a task or label the person no longer has", () => {
    expect(compute(source(), { kind: "time", task: "Z" })).toBeNull();
    expect(compute(source(), { kind: "share", task: "Z" })).toBeNull();
    expect(compute(source(), { kind: "value", label: "z" })).toBeNull();
    expect(
      compute(source({ answers: [] }), { kind: "value", label: "anxiety" })
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

  it("lists the scores a task has", () => {
    expect(taskMetrics(source(), "A")).toEqual(["accuracy", "rt_ms"]);
    expect(taskMetrics(source(), "B")).toEqual([]);
  });

  it("starts a threshold mid-scale", () => {
    expect(defaultThreshold(source().labels[0])).toBe(5);
    expect(defaultThreshold(source().labels[1])).toBe(0.5);
  });

  it("knows which kinds are frequencies", () => {
    expect(isFrequency("map")).toBe(true);
    expect(isFrequency("share")).toBe(true);
    expect(isFrequency("score")).toBe(false);
    expect(isFrequency("band")).toBe(false);
  });
});

describe("reviveViews", () => {
  it("keeps what still applies and repairs what it can", () => {
    const kept = reviveViews(
      [
        {
          id: "a",
          height: {
            ...spec({ kind: "reach", task: "A" }),
            epsilon: -2,
            cutoff: 0,
          },
          color: { ...spec({ kind: "value", label: "anxiety" }), energy: true },
        },
        // a height whose task is gone falls back to the map; a gone colour to none
        {
          id: "b",
          height: spec({ kind: "time", task: "gone" }),
          color: spec({ kind: "band", band: "gamma" }),
        },
        // the main task is a colour, never a height
        {
          id: "c",
          height: spec({ kind: "main" }),
          color: spec({ kind: "main" }),
        },
        {
          id: "d",
          height: spec({ kind: "score", task: "A", metric: "d_prime" }),
          color: spec({ kind: "score", task: "A", metric: "rt_ms" }),
        },
        { id: 3 },
        null,
        "x",
      ],
      source()
    );
    expect(kept.map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
    expect(
      reviveViews(
        [
          {
            id: "e",
            height: spec({ kind: "share", task: "A", smooth: 2 }),
            color: spec({ kind: "main", tasks: ["B", "gone"], smooth: -1 }),
          },
          {
            id: "f",
            height: spec({ kind: "share", task: "A", smooth: 99 }),
            color: spec({ kind: "main", tasks: ["gone"] }),
          },
        ],
        source()
      ).map((v) => [v.height.smooth, v.color?.smooth, v.color?.tasks])
    ).toEqual([
      [2, undefined, ["B"]],
      [undefined, undefined, undefined],
    ]);
    expect(kept[0].height.epsilon).toBe(DEFAULT_EPSILON);
    expect(kept[0].height.cutoff).toBeNull();
    expect(kept[0].color?.energy).toBe(false);
    expect(kept[1].height.kind).toBe("map");
    expect(kept[1].color).toBeNull();
    expect(kept[2].height.kind).toBe("map");
    expect(kept[2].color?.kind).toBe("main");
    expect(kept[3].height.kind).toBe("map");
    expect(kept[3].color?.metric).toBe("rt_ms");
  });

  it("keeps four landscapes at most, and always one", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      height: spec({ kind: "map" }),
      color: null,
    }));
    expect(reviveViews(five, source()).map((v) => v.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(reviveViews({}, source())).toEqual([defaultView()]);
    expect(reviveViews([], source())).toEqual([defaultView()]);
  });
});
