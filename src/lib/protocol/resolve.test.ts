import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { constrainedShuffle, longestRun, resolvePlan } from "./resolve";
import { mulberry32 } from "./rng";

const META = { id: "p", version: 3, title: "P" };

const block = (id: string, extra: Record<string, unknown> = {}) => ({
  type: "block",
  id,
  kind: "prompt",
  label: id,
  config: {},
  ...extra,
});

function tree(children: unknown[], manifest: Record<string, unknown> = {}) {
  return {
    schema: 1,
    manifest,
    root: { type: "sequence", order: "fixed", children },
  };
}

function loopTree(
  rows: number,
  repetitions: number,
  maxRunSame?: number,
  templateSize = 1
) {
  return tree([
    {
      type: "loop",
      id: "trials",
      order: "random",
      repetitions,
      ...(maxRunSame ? { max_run_same: maxRunSame } : {}),
      conditions: {
        columns: ["cond"],
        rows: Array.from({ length: rows }, (_, i) => [`c${i}`]),
      },
      template: {
        type: "sequence",
        order: "fixed",
        children: Array.from({ length: templateSize }, (_, i) =>
          block(`t${i}`, { condition: { $var: "cond" } })
        ),
      },
    },
  ]);
}

const conditions = (plan: ReturnType<typeof resolvePlan>) =>
  plan.steps
    .filter((s) => s.id.startsWith("t0"))
    .map((s) => s.block?.condition);

describe("resolvePlan", () => {
  test("maps meta and manifest onto the definition", () => {
    const plan = resolvePlan(
      tree([block("a")], { content_warning: "Loud." }),
      1,
      META
    );
    expect(plan).toMatchObject({
      id: "p",
      version: 3,
      title: "P",
      contentWarning: "Loud.",
      startMarker: "session_start",
      endMarker: "session_end",
    });
    expect(plan.steps).toEqual([
      {
        id: "a",
        kind: "prompt",
        label: "a",
        phase: "a",
        config: {},
        block: { block_id: "a", node_path: "root/a", iteration: null },
      },
    ]);
    expect("contentWarning" in resolvePlan(tree([block("a")]), 1, META)).toBe(
      false
    );
  });

  test("inserts a seeded, jittered fixation before and a timed rest after", () => {
    const t = tree([
      block("v", { pre_fixation_s: 1, jitter_s: 0.5, post_rest_s: 20 }),
    ]);
    const plan = resolvePlan(t, 7, META);
    expect(plan.steps.map((s) => [s.id, s.kind])).toEqual([
      ["v__pre", "fixation"],
      ["v", "prompt"],
      ["v__post", "rest"],
    ]);
    const fixation = plan.steps[0].config as { duration_s: number };
    expect(fixation.duration_s).toBeGreaterThanOrEqual(1);
    expect(fixation.duration_s).toBeLessThanOrEqual(1.5);
    expect(plan.steps[0].block).toBeUndefined();
    expect(plan.steps[2].config).toEqual({ mode: "timed", duration_s: 20 });
    expect(resolvePlan(t, 7, META)).toEqual(plan);
    const durations = new Set(
      [1, 2, 3, 4, 5].map(
        (seed) =>
          (resolvePlan(t, seed, META).steps[0].config as { duration_s: number })
            .duration_s
      )
    );
    expect(durations.size).toBeGreaterThan(1);
    // A zero-length fixation is no fixation.
    expect(
      resolvePlan(tree([block("z", { pre_fixation_s: 0 })]), 1, META).steps
    ).toHaveLength(1);
  });

  test("substitutes $var in label, condition and anywhere in config", () => {
    const plan = resolvePlan(
      tree([
        {
          type: "loop",
          id: "clips",
          order: "sequential",
          conditions: {
            columns: ["clip", "n"],
            rows: [
              ["m1", 3],
              ["m2", 4],
            ],
          },
          template: {
            type: "sequence",
            order: "fixed",
            children: [
              block("video", {
                kind: "video",
                label: { $var: "clip" },
                condition: { $var: "n" },
                config: {
                  media_id: { $var: "clip" },
                  cues: [{ atS: { $var: "n" } }],
                },
              }),
            ],
          },
        },
      ]),
      1,
      META
    );
    expect(plan.steps.map((s) => s.id)).toEqual(["video~0", "video~1"]);
    expect(plan.steps[1]).toMatchObject({
      label: "m2",
      config: { media_id: "m2", cues: [{ atS: 4 }] },
      block: {
        block_id: "video",
        node_path: "root/clips/video",
        iteration: 1,
        condition: "4",
      },
    });
  });

  test("nested loops suffix every enclosing iteration", () => {
    const inner = {
      type: "loop",
      id: "inner",
      order: "sequential",
      conditions: { columns: ["b"], rows: [["x"], ["y"]] },
      template: {
        type: "sequence",
        order: "fixed",
        children: [block("leaf", { label: { $var: "a" } })],
      },
    };
    const plan = resolvePlan(
      tree([
        {
          type: "loop",
          id: "outer",
          order: "sequential",
          repetitions: 2,
          conditions: { columns: ["a"], rows: [["A"]] },
          template: { type: "sequence", order: "fixed", children: [inner] },
        },
      ]),
      1,
      META
    );
    expect(plan.steps.map((s) => s.id)).toEqual([
      "leaf~0~0",
      "leaf~0~1",
      "leaf~1~0",
      "leaf~1~1",
    ]);
    expect(plan.steps[3].block?.iteration).toBe(1);
    expect(plan.steps[0].label).toBe("A");
  });

  test("shuffled sequences keep each child's expansion together", () => {
    const children = ["a", "b", "c", "d", "e"].map((id) =>
      block(id, { post_rest_s: 5 })
    );
    const t = {
      ...tree([]),
      root: { type: "sequence", order: "shuffle", children },
    };
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const ids = resolvePlan(t, seed, META).steps.map((s) => s.id);
      for (let i = 0; i < ids.length; i += 2)
        expect(ids[i + 1]).toBe(`${ids[i]}__post`);
      orders.add(ids.join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  test("throws on an invalid tree", () => {
    expect(() => resolvePlan({ schema: 1 }, 1, META)).toThrow();
  });

  test("property: the same seed gives the same plan", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        (rows, reps, seed) => {
          const t = loopTree(rows, reps, 2);
          expect(resolvePlan(t, seed, META)).toEqual(
            resolvePlan(t, seed, META)
          );
        }
      )
    );
  });

  test("property: different seeds permute the same multiset of blocks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (rows, seed) => {
          const t = loopTree(rows, 2);
          const plans = [0, 1, 2, 3, 4].map((k) =>
            conditions(resolvePlan(t, seed + k, META))
          );
          const sorted = plans.map((p) => [...p].sort().join());
          expect(new Set(sorted).size).toBe(1);
          expect(new Set(plans.map((p) => p.join())).size).toBeGreaterThan(1);
        }
      )
    );
  });

  test("property: max_run_same is respected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        (rows, reps, maxRun, seed) => {
          const plan = resolvePlan(loopTree(rows, reps, maxRun), seed, META);
          expect(
            longestRun(conditions(plan), (c) => c ?? null)
          ).toBeLessThanOrEqual(maxRun);
        }
      )
    );
  });

  test("property: block count is rows x repetitions x template blocks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer(),
        (rows, reps, size, seed) => {
          const plan = resolvePlan(
            loopTree(rows, reps, undefined, size),
            seed,
            META
          );
          expect(plan.steps.filter((s) => s.block)).toHaveLength(
            rows * reps * size
          );
          expect(new Set(plan.steps.map((s) => s.id)).size).toBe(
            plan.steps.length
          );
        }
      )
    );
  });

  test("budget: 200 blocks resolve in under 50 ms", () => {
    const t = loopTree(10, 10, 1, 2);
    resolvePlan(t, 1, META); // warm-up: JIT, not resolution, is not the budget
    const started = performance.now();
    const plan = resolvePlan(t, 2, META);
    const elapsed = performance.now() - started;
    expect(plan.steps).toHaveLength(200);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("constrainedShuffle", () => {
  test("falls back to a deterministic greedy order under tight constraints", () => {
    // 3 a's and 3 b's with max run 1 has only two valid orders; rejection sampling
    // rarely finds them, the greedy fallback always does.
    const items = ["a", "a", "a", "b", "b", "b"];
    for (let seed = 0; seed < 20; seed++) {
      const out = constrainedShuffle(items, (x) => x, 1, mulberry32(seed));
      expect(longestRun(out, (x) => x)).toBe(1);
      expect([...out].sort()).toEqual(items);
    }
  });

  test("does its best when the constraint is unsatisfiable", () => {
    const out = constrainedShuffle(
      ["a", "a", "a", "b"],
      (x) => x,
      1,
      mulberry32(1)
    );
    expect([...out].sort()).toEqual(["a", "a", "a", "b"]);
  });

  test("null keys never form a run", () => {
    expect(longestRun([null, null, "a"], (x) => x)).toBe(1);
  });
});
