import { describe, expect, test } from "vitest";
import { parseTree, safeParseTree, varNames } from "./tree";

const block = (id: string, extra: Record<string, unknown> = {}) => ({
  type: "block",
  id,
  kind: "fixation",
  label: id,
  config: {},
  ...extra,
});

const tree = (children: unknown[], manifest: Record<string, unknown> = {}) => ({
  schema: 1,
  manifest,
  root: { type: "sequence", order: "fixed", children },
});

describe("parseTree", () => {
  test("fills the manifest and loop defaults", () => {
    const parsed = parseTree(
      tree([
        {
          type: "loop",
          id: "l",
          order: "sequential",
          conditions: { columns: ["c"], rows: [["a"]] },
          template: {
            type: "sequence",
            order: "fixed",
            children: [block("b", { label: { $var: "c" } })],
          },
        },
      ])
    );
    expect(parsed.manifest).toEqual({
      content_warning: null,
      requires_consent: false,
      consent_text: null,
      min_quality: 0.6,
    });
    const loop = parsed.root.children[0];
    expect(loop.type === "loop" && loop.repetitions).toBe(1);
  });

  test("rejects duplicate ids, ragged rows and unknown $vars at once", () => {
    const result = safeParseTree(
      tree([
        block("a"),
        block("a", { condition: { $var: "nope" } }),
        {
          type: "loop",
          id: "l",
          order: "random",
          conditions: { columns: ["x", "y"], rows: [["1"]] },
          template: {
            type: "sequence",
            order: "fixed",
            children: [block("b", { config: { deep: [{ $var: "z" }] } })],
          },
        },
      ])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/duplicate node id "a"/);
      expect(result.error).toMatch(/\$var "nope"/);
      expect(result.error).toMatch(/row 0 has 1 cells for 2 columns/);
      expect(result.error).toMatch(/block "b": \$var "z"/);
    }
  });

  test("rejects bad shapes: ids, unknown fields, empty sequences, schema version", () => {
    expect(safeParseTree(tree([block("Bad Id")])).ok).toBe(false);
    expect(safeParseTree(tree([block("a", { extra: 1 })])).ok).toBe(false);
    expect(safeParseTree(tree([])).ok).toBe(false);
    // 1 and 2 are both read (2 adds the soundtrack); anything else is not a tree we know.
    expect(safeParseTree({ ...tree([block("a")]), schema: 3 }).ok).toBe(false);
    expect(safeParseTree({ ...tree([block("a")]), schema: 2 }).ok).toBe(true);
    expect(safeParseTree(null).ok).toBe(false);
  });

  test("varNames finds references at any depth and ignores look-alikes", () => {
    expect([
      ...varNames({
        a: [{ $var: "x" }, { b: { $var: "y" } }],
        c: { $var: "z", d: 1 },
      }),
    ]).toEqual(["x", "y"]);
  });
});
