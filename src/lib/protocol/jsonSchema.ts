/**
 * JSON Schema export of the block configs and the protocol tree.
 *
 * The frontend owns each kind's config schema because the kind's renderer lives here
 * (backend decision V3-0004, "Validation, in two places on purpose"). The backend
 * validates stored configs against `schemas/blocks.schema.json`, copied into its repo,
 * and each repo has a test failing when its copy differs - one definition, no hand-kept
 * mirror. `npm run schemas` rewrites the files; `jsonSchema.test.ts` fails when the
 * committed ones are stale.
 *
 * Exported with `io: "input"`: the backend checks what an author *writes*, where fields
 * with defaults are optional, not what a renderer receives after parsing.
 */

import { z } from "zod";
import { protocolTreeSchema } from "./tree";
import type { TaskKind } from "./types";

/** Bumped when the export's own layout changes, not when a kind changes. */
export const BLOCKS_SCHEMA_VERSION = 1;

/** Output paths, relative to the repository root. */
export const BLOCKS_SCHEMA_PATH = "schemas/blocks.schema.json";
export const TREE_SCHEMA_PATH = "schemas/tree.schema.json";

/** `{schema_version, kinds: {<name>: <JSON Schema of its config>}}`, kinds sorted. */
export function blocksJsonSchema(kinds: readonly TaskKind<never>[]) {
  const sorted = [...kinds].sort((a, b) => a.name.localeCompare(b.name));
  return {
    schema_version: BLOCKS_SCHEMA_VERSION,
    kinds: Object.fromEntries(
      sorted.map((kind) => [
        kind.name,
        z.toJSONSchema(kind.configSchema, { io: "input" }),
      ])
    ),
  };
}

/** The protocol tree's shape; block configs are left open (see `blocksJsonSchema`). */
export function treeJsonSchema() {
  return z.toJSONSchema(protocolTreeSchema, { io: "input" });
}

/** Stable text form: two-space indent and a final newline, as committed. */
export function serializeSchema(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
