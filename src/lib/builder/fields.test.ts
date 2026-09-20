import { describe, expect, test } from "vitest";
import blocks from "../../../schemas/blocks.schema.json";
import {
  blankValue,
  describeFields,
  getAtPath,
  humaniseName,
  removeAtPath,
  setAtPath,
  type Field,
  type JsonSchema,
} from "./fields";

const KINDS = (blocks as { kinds: Record<string, JsonSchema> }).kinds;

function byPath(fields: Field[], path: string): Field {
  const field = fields.find((candidate) => candidate.path.join(".") === path);
  if (!field)
    throw new Error(
      `no field "${path}" in ${fields.map((f) => f.path.join("."))}`
    );
  return field;
}

describe("describeFields over the exported kind schemas", () => {
  test("every registered kind produces fields and never an empty form", () => {
    expect(Object.keys(KINDS).length).toBeGreaterThan(5);
    for (const [name, schema] of Object.entries(KINDS)) {
      const fields = describeFields(schema, {});
      expect(fields.length, name).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.path.length, `${name}.${field.label}`).toBeGreaterThan(0);
        expect(field.label, `${name}.${field.path.join(".")}`).not.toBe("");
      }
    }
  });

  test("no kind currently needs the read-only JSON fallback", () => {
    const unsupported = Object.entries(KINDS).flatMap(([name, schema]) =>
      describeFields(schema, {})
        .filter((field) => field.kind === "unsupported")
        .map((field) => `${name}.${field.path.join(".")}`)
    );
    expect(unsupported).toEqual([]);
  });

  test("go-no-go: the variant picks the branch and offers the other one", () => {
    const simple = describeFields(KINDS["go-no-go"] as JsonSchema, {});
    expect(byPath(simple, "variant")).toMatchObject({
      kind: "enum",
      options: ["simple", "cued"],
      required: true,
    });
    expect(byPath(simple, "goRatio").kind).toBe("number");
    // Integers are stepped by one and the unbounded-integer sentinel is dropped.
    expect(byPath(simple, "n")).toMatchObject({
      min: 1,
      step: 1,
      max: undefined,
    });
    // `travelMs: [800, 1200]` is a range, not a list.
    expect(byPath(simple, "travelMs")).toMatchObject({
      kind: "range",
      label: "Travel (ms)",
    });
    expect(byPath(simple, "itiMs").label).toBe("Inter-trial interval (ms)");
    // Nested objects are flattened with a dotted label.
    expect(byPath(simple, "markers.trialStart")).toMatchObject({
      kind: "text",
      label: "Markers.Trial start",
      required: true,
    });
    expect(simple.some((field) => field.path[0] === "nogoMix")).toBe(false);

    const cued = describeFields(KINDS["go-no-go"] as JsonSchema, {
      variant: "cued",
    });
    expect(byPath(cued, "nogoMix.redCargo").kind).toBe("number");
    expect(byPath(cued, "cueMs").kind).toBe("range");
    expect(cued.some((field) => field.path[0] === "goRatio")).toBe(false);
  });

  test("questionnaire: a list of rows keeps the row schema", () => {
    const fields = describeFields(KINDS.questionnaire as JsonSchema, {});
    expect(byPath(fields, "instrument")).toMatchObject({
      kind: "enum",
      options: ["sam", "vas", "nasa_tlx", "custom"],
      required: true,
    });
    expect(byPath(fields, "prompt").kind).toBe("textarea");
    const items = byPath(fields, "items");
    expect(items).toMatchObject({ kind: "list", min: 1 });

    // The row's own fields, including its fixed pair of anchors.
    const row = describeFields(items.itemSchema as JsonSchema, {});
    expect(byPath(row, "text")).toMatchObject({ required: true });
    expect(byPath(row, "points")).toMatchObject({ min: 2, max: 11, step: 1 });
    expect(byPath(row, "anchors")).toMatchObject({
      kind: "list",
      min: 2,
      max: 2,
    });
    expect(byPath(row, "choices").kind).toBe("list");
  });

  test("rest: an if/then requirement is not shown as required", () => {
    const fields = describeFields(KINDS.rest as JsonSchema, {});
    expect(byPath(fields, "mode").options).toEqual(["timed", "self_paced"]);
    expect(byPath(fields, "duration_s")).toMatchObject({
      kind: "number",
      label: "Duration (s)",
      required: false,
    });
    expect(byPath(fields, "message").kind).toBe("textarea");
  });

  test("video: alternative requirements leave every field optional", () => {
    const fields = describeFields(KINDS.video as JsonSchema, {});
    expect(byPath(fields, "src")).toMatchObject({
      kind: "text",
      label: "Source",
      required: false,
    });
    expect(byPath(fields, "media_id").label).toBe("Media");
    expect(byPath(fields, "allowPause").kind).toBe("boolean");
    expect(byPath(fields, "endOn").options).toEqual(["ended", "duration"]);
    const cues = byPath(fields, "cues");
    expect(cues.kind).toBe("list");
    expect(
      byPath(describeFields(cues.itemSchema as JsonSchema, {}), "atS").label
    ).toBe("Time (s)");
  });

  test("instructions: a union of objects follows the chosen mode", () => {
    const timed = describeFields(KINDS.instructions as JsonSchema, {
      advance: { mode: "timed", ms: 2000 },
    });
    expect(byPath(timed, "advance.mode").options).toEqual([
      "timed",
      "key",
      "either",
    ]);
    expect(byPath(timed, "advance.ms").label).toBe("Advance.Duration (ms)");

    const either = describeFields(KINDS.instructions as JsonSchema, {
      advance: { mode: "either", minMs: 500, maxMs: 9000 },
    });
    expect(byPath(either, "advance.maxMs").label).toBe("Advance.Max (ms)");
  });
});

describe("describeFields over hand-written schemas", () => {
  test("resolves a $ref into $defs", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { who: { $ref: "#/$defs/person" } },
      required: ["who"],
      $defs: {
        person: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
    };
    expect(describeFields(schema, {})).toEqual([
      {
        path: ["who", "name"],
        label: "Who.Name",
        kind: "text",
        required: true,
      },
    ]);
  });

  test("an unresolvable $ref becomes an unsupported field", () => {
    const fields = describeFields(
      { type: "object", properties: { x: { $ref: "#/$defs/missing" } } },
      {}
    );
    expect(fields[0]?.kind).toBe("unsupported");
  });

  test("collapses unions of primitives and drops the null branch", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        nullable: { anyOf: [{ type: "string" }, { type: "null" }] },
        consts: { oneOf: [{ const: "a" }, { const: "b" }] },
        widened: {
          anyOf: [
            { type: "number", minimum: 0 },
            { type: "number", minimum: 10 },
          ],
        },
        mixed: { anyOf: [{ type: "string" }, { type: "number" }] },
      },
    };
    const fields = describeFields(schema, {});
    expect(byPath(fields, "nullable").kind).toBe("text");
    expect(byPath(fields, "consts")).toMatchObject({
      kind: "enum",
      options: ["a", "b"],
    });
    expect(byPath(fields, "widened").kind).toBe("number");
    expect(byPath(fields, "mixed").kind).toBe("unsupported");
  });

  test("describes a non-object schema as the value itself", () => {
    expect(describeFields({ type: "string" }, "hi")).toEqual([
      { path: [], label: "", kind: "text", required: true },
    ]);
  });

  test("carries a description and refuses to draw an exotic array", () => {
    const fields = describeFields(
      {
        type: "object",
        properties: {
          note: { type: "string", description: "Why this exists" },
          matrix: { type: "array", items: { type: "array" } },
        },
      },
      {}
    );
    expect(byPath(fields, "note").description).toBe("Why this exists");
    expect(byPath(fields, "matrix").kind).toBe("unsupported");
  });

  test("an exclusive float bound is approximated, an integer one is not", () => {
    const fields = describeFields(
      {
        type: "object",
        properties: {
          ratio: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
          count: { type: "integer", exclusiveMinimum: 0, exclusiveMaximum: 10 },
        },
      },
      {}
    );
    expect(byPath(fields, "ratio")).toMatchObject({ min: 0, max: 1 });
    expect(byPath(fields, "count")).toMatchObject({ min: 1, max: 9, step: 1 });
  });
});

describe("humaniseName", () => {
  test.each([
    ["duration_s", "Duration (s)"],
    ["maxRun", "Max run"],
    ["itiMs", "Inter-trial interval (ms)"],
    ["isiMs", "Inter-stimulus interval (ms)"],
    ["maxNogoRun", "Max no-go run"],
    ["media_id", "Media"],
    ["n", "Trials"],
    ["cueTargetMs", "Cue target (ms)"],
    ["allowPause", "Allow pause"],
    ["postRestS", "Post rest (s)"],
    ["", ""],
  ])("%s -> %s", (name, expected) => {
    expect(humaniseName(name)).toBe(expected);
  });
});

describe("paths", () => {
  test("reads through objects and arrays and stops at a hole", () => {
    const value = { a: [{ b: 1 }] };
    expect(getAtPath(value, ["a", "0", "b"])).toBe(1);
    expect(getAtPath(value, ["a", "1", "b"])).toBeUndefined();
    expect(getAtPath(value, ["missing", "deep"])).toBeUndefined();
  });

  test("setAtPath copies every container it touches", () => {
    const value = { a: { b: 1 }, keep: [1, 2] };
    const next = setAtPath(value, ["a", "b"], 2);
    expect(next).toEqual({ a: { b: 2 }, keep: [1, 2] });
    expect(value).toEqual({ a: { b: 1 }, keep: [1, 2] });
    expect(next).not.toBe(value);
    expect(next.a).not.toBe(value.a);
    // Untouched branches are shared, which is what makes identity comparison cheap.
    expect(next.keep).toBe(value.keep);
  });

  test("setAtPath creates arrays for numeric segments and removes on undefined", () => {
    expect(setAtPath({}, ["range", "1"], 1200)).toEqual({
      range: [undefined, 1200],
    });
    expect(setAtPath({ a: 1, b: 2 }, ["a"], undefined)).toEqual({ b: 2 });
    expect(setAtPath({ a: { b: 1, c: 2 } }, ["a", "b"], undefined)).toEqual({
      a: { c: 2 },
    });
    expect(setAtPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
  });

  test("removeAtPath splices rows and deletes properties", () => {
    const value = { rows: [{ id: "a" }, { id: "b" }], other: true };
    expect(removeAtPath(value, ["rows", "0"])).toEqual({
      rows: [{ id: "b" }],
      other: true,
    });
    expect(value.rows).toHaveLength(2);
    expect(removeAtPath(value, ["other"])).toEqual({ rows: value.rows });
    expect(removeAtPath(value, ["missing", "deep"])).toBe(value);
    expect(removeAtPath(value, [])).toBeUndefined();
    expect(removeAtPath("scalar", ["x"])).toBe("scalar");
  });
});

describe("blankValue", () => {
  test.each([
    [{ type: "string" }, ""],
    [{ type: "integer" }, 0],
    [{ type: "boolean" }, false],
    [{ type: "array" }, []],
    [{ type: "object" }, {}],
    [{ type: "string", enum: ["a", "b"] }, "a"],
  ])("%o -> %o", (schema, expected) => {
    expect(blankValue(schema as JsonSchema)).toEqual(expected);
  });

  test("an unknown schema contributes nothing but a placeholder", () => {
    expect(blankValue(undefined)).toBeNull();
  });
});
