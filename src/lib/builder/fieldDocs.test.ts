import { expect, test } from "vitest";
import blocks from "../../../schemas/blocks.schema.json";
import { docFor, docKey, present } from "./fieldDocs";
import { describeFields, type JsonSchema } from "./fields";

type Schema = Record<string, unknown>;

/** Every setting path a kind's schema declares, unions and list rows included. */
function paths(schema: Schema, base: string[] = [], out = new Set<string>()) {
  const properties = (schema.properties ?? {}) as Record<string, Schema>;
  for (const [name, child] of Object.entries(properties)) {
    out.add([...base, name].join("."));
    paths(child, [...base, name], out);
  }
  for (const key of ["oneOf", "anyOf"] as const)
    for (const option of (schema[key] ?? []) as Schema[])
      paths(option, base, out);
  if (schema.items && !Array.isArray(schema.items))
    paths(schema.items as Schema, base, out);
  return out;
}

test("every setting of every kind is explained", () => {
  const kinds = (blocks as { kinds: Record<string, Schema> }).kinds;
  const gaps: string[] = [];
  for (const [kind, schema] of Object.entries(kinds))
    for (const path of paths(schema))
      if (!docFor(kind, path.split("."))) gaps.push(`${kind}: ${path}`);
  // a new schema property lands here until someone writes its name and its help
  expect(gaps).toEqual([]);
});

test("list indexes are not part of a setting's name", () => {
  expect(docKey(["lines", "0", "text"])).toBe("lines.text");
});

test("a block's form starts with what an author needs", () => {
  const schema = (blocks as { kinds: Record<string, JsonSchema> }).kinds.video;
  const fields = present(
    "video",
    describeFields(schema, { media_id: "m1", endOn: "ended" })
  );
  const labels = fields.map((field) => field.label);
  // the builder fills the media in; nobody types an id
  expect(labels).not.toContain("Media");
  expect(labels).toContain("The participant can pause");
  const cues = fields.find((field) => field.path[0] === "cues");
  expect(cues?.advanced).toBe(true);
  const endOn = fields.find((field) => field.path[0] === "endOn");
  expect(endOn?.optionLabels?.ended).toBe("When the video ends");
  expect(endOn?.description).toMatch(/finishes/);
});
