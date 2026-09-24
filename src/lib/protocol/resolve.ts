/**
 * Resolution: a protocol tree plus a session seed -> the flat plan the runner executes.
 *
 * Backend decision V3-0004: all structure is spent before the first block, so the runner
 * stays linear and small. Resolution is pure and deterministic in `(tree, seed)` - every
 * random choice draws from a generator seeded by the session seed *and* the place in the
 * tree it is made, so adding a block elsewhere never reshuffles an unrelated loop. The
 * client posts the resolved plan back and the backend stores it, but because resolution
 * is reproducible that stored copy is a record, not the only copy of the truth.
 *
 * What resolution does, in order: expands loops (rows x repetitions, sequential or
 * shuffled under `max_run_same`), shuffles `order: shuffle` sequences, substitutes
 * `{"$var": column}` with the row's value, and inserts a `fixation` step before a block
 * with `pre_fixation_s` and a timed `rest` step after one with `post_rest_s`.
 *
 * Block configs are *not* validated here: bind media (`media.ts`) and then run the
 * result through `parseProtocol`, which checks every config against its kind and fills
 * in the kind's defaults.
 */

import { type Rng, hash32, mulberry32, shuffleInPlace } from "./rng";
import {
  type BlockNode,
  type Cell,
  type Cue,
  type LoopNode,
  type SequenceNode,
  type TreeNode,
  parseTree,
} from "./tree";
import type { PlannedCue, ProtocolDefinition, ProtocolStep } from "./types";

/** The catalog facts a plan carries that the tree does not. */
export interface PlanMeta {
  id: string;
  version: number;
  title: string;
}

type Scope = Readonly<Record<string, Cell>>;

interface Context {
  seed: number;
  scope: Scope;
  /** Presentation index in every enclosing loop, outermost first. */
  iterations: number[];
}

/** How many unsuccessful random shuffles before the deterministic fallback. */
const SHUFFLE_ATTEMPTS = 50;

/** Longest run of equal keys; a null key never extends a run. */
export function longestRun<T>(items: T[], key: (item: T) => string | null) {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const item of items) {
    const k = key(item);
    run = k !== null && k === previous ? run + 1 : 1;
    previous = k;
    longest = Math.max(longest, run);
  }
  return longest;
}

/**
 * Shuffle with no more than `maxRun` consecutive items sharing a key.
 *
 * Rejection sampling first, because a uniformly random order that happens to satisfy the
 * constraint is the unbiased answer. If that keeps failing (tight constraints), a greedy
 * construction takes over: at each position, among the items that would not break the
 * run limit, the one whose key has the most items left, ties in shuffled order. That is
 * deterministic in `rng` and succeeds whenever the constraint is satisfiable for all the
 * inputs we generate; when it is not satisfiable at all it returns the best it can.
 */
export function constrainedShuffle<T>(
  items: readonly T[],
  key: (item: T) => string | null,
  maxRun: number | undefined,
  rng: Rng
): T[] {
  const shuffled = shuffleInPlace([...items], rng);
  if (maxRun === undefined || longestRun(shuffled, key) <= maxRun)
    return shuffled;
  for (let attempt = 1; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    shuffleInPlace(shuffled, rng);
    if (longestRun(shuffled, key) <= maxRun) return shuffled;
  }

  const pool = [...shuffled];
  const remaining = new Map<string | null, number>();
  for (const item of pool)
    remaining.set(key(item), (remaining.get(key(item)) ?? 0) + 1);
  const out: T[] = [];
  let run = 0;
  let previous: string | null = null;
  while (pool.length > 0) {
    let pick = -1;
    let best = -1;
    pool.forEach((item, index) => {
      const k = key(item);
      if (k !== null && k === previous && run >= maxRun) return;
      const left = remaining.get(k) ?? 0;
      if (left > best) {
        best = left;
        pick = index;
      }
    });
    if (pick === -1) pick = 0;
    const [item] = pool.splice(pick, 1);
    const k = key(item);
    remaining.set(k, (remaining.get(k) ?? 1) - 1);
    run = k !== null && k === previous ? run + 1 : 1;
    previous = k;
    out.push(item);
  }
  return out;
}

function isVarRef(value: unknown): value is { $var: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { $var?: unknown }).$var === "string"
  );
}

/** Replace every `{"$var": column}` under `value` with the scope's cell. */
function substitute(value: unknown, scope: Scope, where: string): unknown {
  if (isVarRef(value)) {
    if (!(value.$var in scope))
      throw new Error(`${where}: $var "${value.$var}" has no value here`);
    return scope[value.$var];
  }
  if (Array.isArray(value))
    return value.map((item) => substitute(item, scope, where));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substitute(v, scope, where)])
    );
  return value;
}

function asText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function rngFor(ctx: Context, ...parts: (string | number)[]): Rng {
  return mulberry32(hash32(ctx.seed, ...parts, ctx.iterations.join(".")));
}

function expandBlock(node: BlockNode, path: string, ctx: Context) {
  const stepId = node.id + ctx.iterations.map((i) => `~${i}`).join("");
  const where = `block "${stepId}"`;
  const label = asText(substitute(node.label, ctx.scope, where)) ?? node.id;
  const condition = asText(substitute(node.condition, ctx.scope, where));
  const config = substitute(node.config, ctx.scope, where);
  const steps: ProtocolStep[] = [];

  if (node.pre_fixation_s !== undefined || node.jitter_s !== undefined) {
    const extra = node.jitter_s
      ? mulberry32(hash32(ctx.seed, "jitter", stepId))() * node.jitter_s
      : 0;
    const duration = Math.round(((node.pre_fixation_s ?? 0) + extra) * 1000);
    if (duration > 0)
      steps.push({
        id: `${stepId}__pre`,
        kind: "fixation",
        label,
        phase: "fixation",
        startMarker: "fixation_start",
        endMarker: "fixation_end",
        config: { duration_s: duration / 1000 },
      });
  }

  steps.push({
    id: stepId,
    kind: node.kind,
    label,
    phase: node.id,
    config,
    block: {
      block_id: node.id,
      node_path: path,
      iteration: ctx.iterations.at(-1) ?? null,
      ...(condition !== undefined ? { condition } : {}),
    },
  });

  if (node.post_rest_s)
    steps.push({
      id: `${stepId}__post`,
      kind: "rest",
      label,
      phase: "rest",
      startMarker: "rest_start",
      endMarker: "rest_end",
      config: { mode: "timed", duration_s: node.post_rest_s },
    });
  return steps;
}

function expandSequence(
  node: SequenceNode,
  path: string,
  ctx: Context
): ProtocolStep[] {
  const units = node.children.map((child, index) => ({
    steps: expandNode(child, `${path}/${child.id ?? index}`, ctx),
    key:
      child.type === "block"
        ? (asText(substitute(child.condition, ctx.scope, path)) ?? null)
        : null,
  }));
  const ordered =
    node.order === "shuffle"
      ? constrainedShuffle(
          units,
          (u) => u.key,
          node.max_run_same,
          rngFor(ctx, "shuffle", path)
        )
      : units;
  return ordered.flatMap((u) => u.steps);
}

function expandLoop(node: LoopNode, path: string, ctx: Context) {
  const indices: number[] = [];
  for (let r = 0; r < node.repetitions; r++)
    node.conditions.rows.forEach((_, i) => indices.push(i));
  const rowKey = (i: number) => JSON.stringify(node.conditions.rows[i]);
  const order =
    node.order === "random"
      ? constrainedShuffle(
          indices,
          rowKey,
          node.max_run_same,
          rngFor(ctx, "loop", path)
        )
      : indices;

  return order.flatMap((rowIndex, iteration) => {
    const row = node.conditions.rows[rowIndex];
    const scope = { ...ctx.scope };
    node.conditions.columns.forEach((column, c) => (scope[column] = row[c]));
    return expandSequence(node.template, path, {
      seed: ctx.seed,
      scope,
      iterations: [...ctx.iterations, iteration],
    });
  });
}

function expandNode(node: TreeNode, path: string, ctx: Context) {
  if (node.type === "block") return expandBlock(node, path, ctx);
  if (node.type === "loop") return expandLoop(node, path, ctx);
  return expandSequence(node, path, ctx);
}

/**
 * Resolve a protocol tree into the flat `ProtocolDefinition` the runner executes.
 *
 * `input` is parsed with `parseTree` first (so an unvalidated API payload is fine) and
 * the call throws on an invalid tree. Step ids are the block id, plus `~<iteration>` per
 * enclosing loop (0-based presentation order), plus `__pre`/`__post` for inserted
 * fixation and rest. `seed` is the session seed the backend issued (a 32-bit integer).
 */
export function resolvePlan(
  input: unknown,
  seed: number,
  meta: PlanMeta
): ProtocolDefinition {
  const tree = parseTree(input);
  const steps = expandSequence(tree.root, tree.root.id ?? "root", {
    seed: seed >>> 0,
    scope: {},
    iterations: [],
  });
  const soundtrack = planSoundtrack(tree.soundtrack ?? [], steps);
  return {
    id: meta.id,
    version: meta.version,
    title: meta.title,
    ...(tree.manifest.content_warning
      ? { contentWarning: tree.manifest.content_warning }
      : {}),
    startMarker: "session_start",
    endMarker: "session_end",
    steps,
    ...(soundtrack.length ? { soundtrack } : {}),
  };
}

/**
 * Anchor each cue to the steps its blocks became (V3-0014).
 *
 * A block that repeats inside a loop anchors on its first occurrence. A cue whose start
 * block never appears in the plan is dropped - it could not start - and a stop block that
 * never appears falls back to the end of the protocol, so a sound is never left playing
 * with nothing to end it.
 */
export function planSoundtrack(
  cues: readonly Cue[],
  steps: readonly ProtocolStep[]
): PlannedCue[] {
  const firstStep = (blockId: string) =>
    steps.findIndex((s) => s.block?.block_id === blockId);
  const planned: PlannedCue[] = [];
  for (const cue of cues) {
    let startStep: number | null = null;
    if (cue.start?.block) {
      const at = firstStep(cue.start.block);
      if (at < 0) continue;
      startStep = at;
    }
    let stop: PlannedCue["stop"];
    if (cue.stop === "clip_end" || cue.stop === "protocol_end") {
      stop = { kind: cue.stop };
    } else {
      const at = firstStep(cue.stop.block);
      stop = at < 0 ? { kind: "protocol_end" } : { kind: "step", step: at };
    }
    planned.push({
      id: cue.id,
      ...(cue.label ? { label: cue.label } : {}),
      media_id: cue.media_id,
      startStep,
      offsetS: cue.start?.offset_s ?? 0,
      stop,
      loop: cue.loop ?? false,
      volume: cue.volume ?? 0.6,
      fadeS: cue.fade_s ?? 1,
    });
  }
  return planned;
}
