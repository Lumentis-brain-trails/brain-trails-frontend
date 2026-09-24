import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type BlockMetrics,
  DEFAULT_ROWS,
  ROWS,
  ROWS_STORAGE_KEY,
  applies,
  direction,
  formatValue,
  missingReason,
  position,
  readRows,
  rowSpec,
  sharedDomain,
  writeRows,
} from "./rows";

function block(extra: Partial<BlockMetrics> = {}): BlockMetrics {
  return {
    block_id: "dock",
    key: "dock#0",
    label: "Dock the cargo",
    kind: "go-no-go",
    condition: null,
    node_path: null,
    iteration: null,
    t_start_s: 0,
    t_end_s: 60,
    n_windows: 56,
    bands: { alpha: 0.31, beta: 0.2, theta: 0.18, delta: 0.25 },
    bands_uv2: {},
    ratios: {},
    asymmetry: null,
    artefact: null,
    good_contact: null,
    baseline_distance: null,
    ...extra,
  } as BlockMetrics;
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the row catalogue", () => {
  test("every row has a distinct id and the defaults are in it", () => {
    const ids = ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of DEFAULT_ROWS) expect(ids).toContain(id);
  });

  test("band rows read the block's relative power", () => {
    expect(rowSpec("alpha").value(block())).toBe(0.31);
    expect(rowSpec("delta").value(block())).toBe(0.25);
  });

  test("dynamics rows read the block's dynamics", () => {
    const b = block({
      dynamics: {
        n_windows: 56,
        n_regions: 7,
        entropy: 1.4,
        recurrence: 0.6,
        modularity: 0.2,
        diameter: 3.1,
        stretching: 0.08,
      },
    });
    expect(rowSpec("entropy").value(b)).toBe(1.4);
    expect(rowSpec("stretching").value(b)).toBe(0.08);
    expect(rowSpec("entropy").value(block())).toBeNull();
  });

  test("task rows read the behaviour and the average person", () => {
    const b = block({
      behaviour: { accuracy: 0.82, rt: { median_ms: 410 } },
      norm: {
        n_people: 12,
        accuracy: 0.78,
        hit_rate: null,
        commission_rate: null,
        median_rt_ms: 450,
        rt_mad_ms: null,
      },
    } as unknown as Partial<BlockMetrics>);
    const accuracy = rowSpec("accuracy");
    expect(accuracy.value(b)).toBe(0.82);
    expect(accuracy.norm?.(b.norm!)).toBe(0.78);
    expect(rowSpec("reaction_time").value(b)).toBe(410);
    expect(rowSpec("reaction_time").norm?.(b.norm!)).toBe(450);
  });
});

describe("missingReason", () => {
  test("says why a cell is empty", () => {
    expect(missingReason(rowSpec("accuracy"), block())).toBe("not_task");
    expect(missingReason(rowSpec("entropy"), block())).toBe("not_ready");
    const short = block({
      dynamics: {
        n_windows: 8,
        n_regions: 2,
        entropy: null,
        recurrence: null,
        modularity: null,
        diameter: null,
        stretching: null,
      },
    });
    expect(missingReason(rowSpec("entropy"), short)).toBe("short");
    expect(missingReason(rowSpec("modularity"), short)).toBe("no_labels");
  });
});

describe("scales", () => {
  test("a fixed domain is kept, a free one fits the largest value with room", () => {
    expect(sharedDomain(rowSpec("alpha"), [0.3, 0.9])).toEqual([0, 1]);
    const [lo, hi] = sharedDomain(rowSpec("reaction_time"), [400, null, 500]);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(575);
    expect(sharedDomain(rowSpec("entropy"), [null, null])).toEqual([0, 1]);
  });

  test("positions are clamped to the scale", () => {
    expect(position(0.5, [0, 1])).toBe(0.5);
    expect(position(2, [0, 1])).toBe(1);
    expect(position(-1, [0, 1])).toBe(0);
    expect(position(1, [1, 1])).toBe(0);
  });
});

describe("formatValue", () => {
  test("writes each kind of number the way a reader expects", () => {
    expect(formatValue("percent", 0.823)).toBe("82%");
    expect(formatValue("ms", 412.6)).toBe("413 ms");
    expect(formatValue("bits", 1.234)).toBe("1.23");
    expect(formatValue("radii", 3.14)).toBe("3.1");
    expect(formatValue("ratio", 0.084)).toBe("0.08");
  });
});

describe("the reader's rows", () => {
  test("start from the defaults and survive a reload", () => {
    expect(readRows()).toEqual([...DEFAULT_ROWS]);
    writeRows(["theta", "diameter"]);
    expect(window.localStorage.getItem(ROWS_STORAGE_KEY)).toBe(
      '["theta","diameter"]'
    );
    expect(readRows()).toEqual(["theta", "diameter"]);
  });

  test("an unknown or corrupt entry is dropped, not trusted", () => {
    window.localStorage.setItem(ROWS_STORAGE_KEY, '["theta","nonsense",3]');
    expect(readRows()).toEqual(["theta"]);
    window.localStorage.setItem(ROWS_STORAGE_KEY, "{not json");
    expect(readRows()).toEqual([...DEFAULT_ROWS]);
  });

  test("blocked storage falls back to the defaults and never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readRows()).toEqual([...DEFAULT_ROWS]);
    expect(() => writeRows(["alpha"])).not.toThrow();
  });
});

describe("direction", () => {
  test("compares at the precision the cells show", () => {
    expect(direction("percent", 0.38, 0.22)).toBe("higher");
    expect(direction("percent", 0.22, 0.38)).toBe("lower");
    // both read 22%: the same to the reader, so neither is coloured
    expect(direction("percent", 0.2201, 0.2249)).toBe("same");
    expect(direction("ms", 412.4, 411.6)).toBe("same");
    expect(direction("bits", 1.34, 1.33)).toBe("higher");
    expect(direction("radii", 3.14, 3.12)).toBe("same");
  });

  test("no comparison without both values", () => {
    expect(direction("percent", null, 0.3)).toBeNull();
    expect(direction("percent", 0.3, null)).toBeNull();
  });
});

describe("applies", () => {
  test("task rows need a block with trials; the rest apply everywhere", () => {
    const task = { ...block(), behaviour: { accuracy: 0.8 } } as BlockMetrics;
    expect(applies(rowSpec("accuracy"), [block(), block()])).toBe(false);
    expect(applies(rowSpec("accuracy"), [block(), task])).toBe(true);
    expect(applies(rowSpec("alpha"), [block(), block()])).toBe(true);
  });

  test("the default is every row", () => {
    expect(DEFAULT_ROWS).toEqual(ROWS.map((r) => r.id));
  });
});
