/**
 * The block-config schemas the inspector draws its forms from (sprint S19).
 *
 * They are generated from the kinds' own zod schemas (`npm run schemas`) and committed,
 * so the builder, the runtime and the backend all validate against one definition. The
 * import is the committed file rather than a runtime fetch: it is a few kilobytes, it
 * must match the build that renders the forms, and a form that cannot be drawn because a
 * request failed would be worse than a larger bundle.
 */

import blocks from "../../../schemas/blocks.schema.json";

export type JsonSchema = Record<string, unknown>;

export const SCHEMA_VERSION: number = blocks.schema_version;

export const KIND_SCHEMAS: Record<string, JsonSchema> = blocks.kinds as Record<
  string,
  JsonSchema
>;

/** The schema of one kind, or an empty object schema when the kind is unknown. */
export function schemaFor(kind: string): JsonSchema {
  return KIND_SCHEMAS[kind] ?? { type: "object", properties: {} };
}
