/**
 * The stored protocol definition: a versioned tree of blocks (backend decision V3-0004).
 *
 * A protocol version is saved as this tree and resolved, per session, into the flat
 * `ProtocolDefinition` the runner executes (`resolve.ts`). This module validates the
 * tree's *shape* only: every block's `config` belongs to its kind and is checked by that
 * kind's own schema through the registry, after resolution has substituted `$var`s -
 * inside a loop template a config is not yet a valid config, it is a config with holes.
 *
 * The backend (pydantic) validates the same shape; `schemas/tree.schema.json` is this
 * schema exported so the two can be compared rather than trusted to agree.
 */

import { z } from "zod";

/** The current tree format; bumped only with a migration of stored versions. */
/**
 * The version the builder writes. 2 adds the soundtrack (backend V3-0014); a tree that
 * declares 1 is still read exactly as before, and is a valid 2 as it stands.
 */
export const TREE_SCHEMA_VERSION = 2;

/**
 * Node ids are stable handles: they name steps and appear in every marker and in
 * BIDS `events.tsv`. Lowercase and short, so they read well in both.
 */
export const nodeIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,63}$/,
    "id must be 1-64 lowercase letters, digits, '_' or '-', starting with a letter or digit"
  );

/** A loop column reference, replaced by the row's value at resolution. */
export const varRefSchema = z.strictObject({ $var: z.string().min(1) });
export type VarRef = z.infer<typeof varRefSchema>;

/** A condition cell: what a loop's rows may hold (a media id is a string). */
export const cellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type Cell = z.infer<typeof cellSchema>;

export const blockNodeSchema = z.strictObject({
  type: z.literal("block"),
  id: nodeIdSchema,
  kind: z.string().min(1),
  label: z.union([z.string().min(1), varRefSchema]),
  /** Becomes BIDS `trial_type`; may come from a loop column. */
  condition: z.union([z.string(), varRefSchema]).optional(),
  pre_fixation_s: z.number().min(0).optional(),
  /** Uniform extra fixation in [0, jitter_s], drawn from the session seed. */
  jitter_s: z.number().min(0).optional(),
  post_rest_s: z.number().min(0).optional(),
  skippable: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
});

export type BlockNode = z.infer<typeof blockNodeSchema>;

export interface SequenceNode {
  type: "sequence";
  id?: string;
  label?: string;
  order: "fixed" | "shuffle";
  max_run_same?: number;
  children: TreeNode[];
}

export interface LoopNode {
  type: "loop";
  id: string;
  label?: string;
  template: SequenceNode;
  conditions: { columns: string[]; rows: Cell[][] };
  order: "sequential" | "random";
  repetitions: number;
  max_run_same?: number;
}

export type TreeNode = SequenceNode | LoopNode | BlockNode;

/*
 * The recursive schemas use getters (zod v4's way to express recursion) so the same
 * objects serve parsing and `z.toJSONSchema`, which turns the cycle into a `$ref`.
 */
export const sequenceNodeSchema = z.strictObject({
  type: z.literal("sequence"),
  id: nodeIdSchema.optional(),
  label: z.string().optional(),
  // Optional, like the backend's: a sequence with no order stated runs in order.
  order: z.enum(["fixed", "shuffle"]).default("fixed"),
  max_run_same: z.number().int().min(1).optional(),
  get children() {
    return z.array(treeNodeSchema).min(1);
  },
});

export const loopNodeSchema = z.strictObject({
  type: z.literal("loop"),
  id: nodeIdSchema,
  label: z.string().optional(),
  get template() {
    return sequenceNodeSchema;
  },
  conditions: z.strictObject({
    columns: z.array(z.string().min(1)).min(1),
    rows: z.array(z.array(cellSchema)).min(1),
  }),
  order: z.enum(["sequential", "random"]).default("sequential"),
  repetitions: z.number().int().min(1).default(1),
  max_run_same: z.number().int().min(1).optional(),
});

export const treeNodeSchema: z.ZodType<TreeNode> = z.discriminatedUnion(
  "type",
  [sequenceNodeSchema, loopNodeSchema, blockNodeSchema]
) as unknown as z.ZodType<TreeNode>;

export const manifestSchema = z.strictObject({
  content_warning: z.string().min(1).nullable().default(null),
  requires_consent: z.boolean().default(false),
  consent_text: z.string().min(1).nullable().default(null),
  /** Minimum headband signal quality (0-1) the pre-flight asks for. */
  min_quality: z.number().min(0).max(1).default(0.6),
});

export type ProtocolManifest = z.infer<typeof manifestSchema>;

/**
 * One sound on the soundtrack: the lane that plays over the blocks instead of taking a
 * turn (backend V3-0014). Anchored to blocks, not to a clock time, because blocks do not
 * have fixed lengths - "at 30 seconds" would land somewhere different on every run.
 */
export const cueSchema = z.strictObject({
  id: z.string().min(1).max(60),
  label: z.string().max(200).optional(),
  media_id: z.string().min(1),
  /** No block: the start of the protocol. A repeated block anchors on its first run. */
  start: z
    .strictObject({
      block: z.string().min(1).max(60).optional(),
      offset_s: z.number().min(0).max(3600).default(0),
    })
    .default({ offset_s: 0 }),
  stop: z
    .union([
      z.enum(["clip_end", "protocol_end"]),
      z.strictObject({ block: z.string().min(1).max(60) }),
    ])
    .default("clip_end"),
  loop: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(0.6),
  fade_s: z.number().min(0).max(10).default(1),
});

export type Cue = z.infer<typeof cueSchema>;

export const protocolTreeSchema = z.strictObject({
  schema: z.union([z.literal(1), z.literal(2)]),
  manifest: manifestSchema,
  get root() {
    return sequenceNodeSchema;
  },
  soundtrack: z.array(cueSchema).max(20).default([]),
});

export interface ProtocolTree {
  schema: 1 | 2;
  manifest: ProtocolManifest;
  root: SequenceNode;
  /** Sounds over the blocks; empty for every tree written before schema 2. */
  soundtrack: Cue[];
}

/** Every node in document order, with the loop (if any) that encloses it. */
function* walk(
  node: TreeNode,
  loops: LoopNode[] = []
): Generator<{ node: TreeNode; loops: LoopNode[] }> {
  yield { node, loops };
  if (node.type === "sequence")
    for (const child of node.children) yield* walk(child, loops);
  else if (node.type === "loop") yield* walk(node.template, [...loops, node]);
}

/** Every `$var` name used anywhere under `value`. */
export function varNames(value: unknown, into: Set<string> = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => varNames(v, into));
  else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$var === "string" && Object.keys(record).length === 1)
      into.add(record.$var);
    else Object.values(record).forEach((v) => varNames(v, into));
  }
  return into;
}

/**
 * Parse and check a protocol tree.
 *
 * Beyond the shape: node ids are unique (they become step ids and marker fields), every
 * loop row has one cell per column, and every `$var` names a column of an enclosing
 * loop. Throws an `Error` listing every problem at once; the returned tree has its
 * defaults filled in (`repetitions`, the manifest fields).
 */
export function parseTree(input: unknown): ProtocolTree {
  const tree = protocolTreeSchema.parse(input) as ProtocolTree;
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const { node, loops } of walk(tree.root)) {
    if (node.id !== undefined) {
      if (ids.has(node.id)) issues.push(`duplicate node id "${node.id}"`);
      ids.add(node.id);
    }
    if (node.type === "loop") {
      const width = node.conditions.columns.length;
      node.conditions.rows.forEach((row, i) => {
        if (row.length !== width)
          issues.push(
            `loop "${node.id}": row ${i} has ${row.length} cells for ${width} columns`
          );
      });
    }
    if (node.type === "block") {
      const scope = new Set(loops.flatMap((l) => l.conditions.columns));
      for (const name of varNames([node.label, node.condition, node.config]))
        if (!scope.has(name))
          issues.push(
            `block "${node.id}": $var "${name}" is not a column of an enclosing loop`
          );
    }
  }

  if (issues.length > 0)
    throw new Error(`invalid protocol tree:\n  ${issues.join("\n  ")}`);
  return tree;
}

/** Non-throwing variant, for callers rendering an error state instead of crashing. */
export function safeParseTree(
  input: unknown
): { ok: true; tree: ProtocolTree } | { ok: false; error: string } {
  try {
    return { ok: true, tree: parseTree(input) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
