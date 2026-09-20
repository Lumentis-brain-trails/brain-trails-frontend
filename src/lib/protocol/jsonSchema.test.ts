import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import "@/components/protocol/kinds";
import {
  BLOCKS_SCHEMA_PATH,
  TREE_SCHEMA_PATH,
  blocksJsonSchema,
  serializeSchema,
  treeJsonSchema,
} from "./jsonSchema";
import { getTaskKind, knownKinds } from "./registry";

/**
 * `npm run schemas` runs this file with SCHEMAS_WRITE=1 to rewrite the committed files;
 * otherwise it fails when they are stale, which is the frontend half of the mirror check
 * (the backend copies blocks.schema.json and checks its copy the same way).
 */
const WRITE = process.env.SCHEMAS_WRITE === "1";

function expected(): Record<string, string> {
  return {
    [BLOCKS_SCHEMA_PATH]: serializeSchema(
      blocksJsonSchema(knownKinds().map(getTaskKind))
    ),
    [TREE_SCHEMA_PATH]: serializeSchema(treeJsonSchema()),
  };
}

describe("JSON Schema export", () => {
  test("covers every registered kind", () => {
    const blocks = blocksJsonSchema(knownKinds().map(getTaskKind));
    expect(blocks.schema_version).toBe(1);
    expect(Object.keys(blocks.kinds)).toEqual(knownKinds());
    // Input mode: a field with a default is optional for the author.
    const baseline = blocks.kinds.baseline as { required?: string[] };
    expect(baseline.required ?? []).not.toContain("duration_s");
    // The media refinement survives the export as an anyOf.
    expect(blocks.kinds.video).toMatchObject({
      anyOf: [{ required: ["src"] }, { required: ["media_id"] }],
    });
  });

  test("the tree schema is recursive and closed", () => {
    const tree = treeJsonSchema() as { required: string[] };
    expect(tree.required).toEqual(["schema", "manifest", "root"]);
    expect(JSON.stringify(tree)).toContain('"$ref"');
  });

  test.each(Object.keys(expected()))("%s is up to date", (file) => {
    const target = path.resolve(process.cwd(), file);
    const text = expected()[file];
    if (WRITE) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    expect(
      readFileSync(target, "utf8"),
      `${file} is stale: run \`npm run schemas\` and commit the result`
    ).toBe(text);
  });
});
