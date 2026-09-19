/**
 * The builder's edits, as pure functions over a protocol tree (V3-0004, sprint S19).
 *
 * The timeline is a *view* of the tree's top level: one clip per child of the root - a
 * block, or a group (a shuffled `sequence` or a `loop`). Every edit here returns a new
 * tree, which is what makes undo/redo a list of trees and autosave a single `PUT`.
 *
 * Widths come from `clipSeconds`, a deliberately rough estimate that mirrors the
 * backend's (`app/protocols/definition.py`): a clip is as wide as it lasts, and a task
 * whose length depends on the participant is marked variable rather than guessed at
 * precisely.
 */

import type {
  BlockNode,
  Cell,
  LoopNode,
  ProtocolTree,
  SequenceNode,
  TreeNode,
} from "@/lib/protocol/tree";

/** A media item as the bin hands it to the timeline. */
export interface BinMedia {
  id: string;
  kind: string;
  title: string;
  duration_s?: number | null;
}

export type GroupNode = SequenceNode | LoopNode;

/** One clip of the timeline: a block, or a group with its own children. */
export interface Clip {
  index: number;
  node: TreeNode;
  /** Blocks inside, after expansion: 1 for a block, rows x repetitions for a loop. */
  count: number;
  seconds: number;
  label: string;
  /** True when the real length depends on the participant or on a loop's table. */
  variable: boolean;
}

const DEFAULT_BLOCK_S = 30;

/** Kinds whose length the participant decides; their clip is marked variable. */
const SELF_PACED = new Set(["instructions", "prompt", "text", "questionnaire", "quiz"]);

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Roughly how long one block lasts, lead-in and tail included. */
export function clipSeconds(
  node: TreeNode,
  media: Record<string, BinMedia> = {}
): number {
  if (node.type === "sequence")
    return node.children.reduce((total, c) => total + clipSeconds(c, media), 0);
  if (node.type === "loop") {
    const once = clipSeconds(node.template, media);
    return once * node.conditions.rows.length * (node.repetitions ?? 1);
  }
  const config = node.config as Record<string, unknown>;
  let seconds = DEFAULT_BLOCK_S;
  const mediaId = config.media_id;
  if (typeof config.duration_s === "number") seconds = config.duration_s;
  else if (node.kind === "countdown") seconds = num(config.from, 3);
  else if (typeof mediaId === "string" && media[mediaId])
    seconds = num(media[mediaId].duration_s, DEFAULT_BLOCK_S);
  else if (node.kind === "breathing")
    seconds =
      (num(config.cycles, 1) *
        (num(config.inhaleMs, 0) + num(config.holdMs, 0) + num(config.exhaleMs, 0))) /
        1000 +
      15;
  else if (node.kind === "go-no-go") seconds = 120;
  else if (SELF_PACED.has(node.kind)) seconds = 20;
  return (
    seconds +
    (node.pre_fixation_s ?? 0) +
    (node.jitter_s ?? 0) / 2 +
    (node.post_rest_s ?? 0)
  );
}

function blocksIn(node: TreeNode): number {
  if (node.type === "sequence")
    return node.children.reduce((n, c) => n + blocksIn(c), 0);
  if (node.type === "loop")
    return (
      blocksIn(node.template) *
      node.conditions.rows.length *
      (node.repetitions ?? 1)
    );
  return 1;
}

/** A node's label for the timeline; groups say what they hold. */
export function labelOf(node: TreeNode): string {
  if (node.type === "block")
    return typeof node.label === "string" ? node.label : node.kind;
  if (node.label) return node.label;
  return node.type === "loop" ? "Group (repeats)" : "Group";
}

/** The root's children as clips, in order. */
export function clips(
  tree: ProtocolTree,
  media: Record<string, BinMedia> = {}
): Clip[] {
  return tree.root.children.map((node, index) => ({
    index,
    node,
    count: blocksIn(node),
    seconds: clipSeconds(node, media),
    label: labelOf(node),
    variable:
      node.type !== "block" ? true : SELF_PACED.has(node.kind) || isSelfPacedRest(node),
  }));
}

function isSelfPacedRest(node: BlockNode): boolean {
  return (
    node.kind === "rest" &&
    (node.config as { mode?: unknown }).mode === "self_paced"
  );
}

function withChildren(tree: ProtocolTree, children: TreeNode[]): ProtocolTree {
  return { ...tree, root: { ...tree.root, children } };
}

/** Every id already used anywhere in the tree, so a new one cannot collide. */
export function usedIds(tree: ProtocolTree): Set<string> {
  const ids = new Set<string>();
  const visit = (node: TreeNode) => {
    if (node.id) ids.add(node.id);
    if (node.type === "sequence") node.children.forEach(visit);
    if (node.type === "loop") visit(node.template);
  };
  tree.root.children.forEach(visit);
  return ids;
}

/** A free id from `base`: `base`, then `base-2`, `base-3`... */
export function freeId(tree: ProtocolTree, base: string): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "block";
  const taken = usedIds(tree);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/** Insert a node at `index` (clamped); returns the new tree. */
export function insertAt(
  tree: ProtocolTree,
  index: number,
  node: TreeNode
): ProtocolTree {
  const children = [...tree.root.children];
  children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
  return withChildren(tree, children);
}

/** Move the clip at `from` so that it sits at `to`. */
export function moveClip(
  tree: ProtocolTree,
  from: number,
  to: number
): ProtocolTree {
  const children = [...tree.root.children];
  if (from < 0 || from >= children.length) return tree;
  const [node] = children.splice(from, 1);
  children.splice(Math.max(0, Math.min(to, children.length)), 0, node);
  return withChildren(tree, children);
}

export function removeAt(tree: ProtocolTree, index: number): ProtocolTree {
  const children = tree.root.children.filter((_, i) => i !== index);
  return withChildren(tree, children);
}

/** Replace the clip at `index`. */
export function replaceAt(
  tree: ProtocolTree,
  index: number,
  node: TreeNode
): ProtocolTree {
  const children = tree.root.children.map((c, i) => (i === index ? node : c));
  return withChildren(tree, children);
}

/** Copy the clip at `index` just after it, with fresh ids. */
export function duplicateAt(tree: ProtocolTree, index: number): ProtocolTree {
  const node = tree.root.children[index];
  if (!node) return tree;
  return insertAt(tree, index + 1, renameIds(tree, node));
}

/** A deep copy of `node` whose ids are free in `tree`. */
export function renameIds(tree: ProtocolTree, node: TreeNode): TreeNode {
  const taken = usedIds(tree);
  const fresh = (id: string | undefined, fallback: string): string => {
    const base = id ?? fallback;
    let candidate = `${base}-copy`;
    let n = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-copy-${n}`;
      n += 1;
    }
    taken.add(candidate);
    return candidate;
  };
  const visit = (current: TreeNode): TreeNode => {
    if (current.type === "block")
      return { ...current, id: fresh(current.id, current.kind) };
    if (current.type === "sequence")
      return {
        ...current,
        ...(current.id ? { id: fresh(current.id, "group") } : {}),
        children: current.children.map(visit),
      };
    return {
      ...current,
      id: fresh(current.id, "group"),
      template: visit(current.template) as SequenceNode,
    };
  };
  return visit(node);
}

/**
 * Put the clips at `indices` into one group, in their timeline order.
 *
 * The group is a shuffled-capable `sequence`: it becomes a `loop` only when the author
 * asks for repetitions or a condition table, which the group inspector does. Grouping is
 * how the builder expresses what the tree calls nesting (V3-0004 amendment).
 */
export function groupClips(
  tree: ProtocolTree,
  indices: number[]
): { tree: ProtocolTree; index: number } {
  const picked = [...new Set(indices)].sort((a, b) => a - b);
  if (picked.length < 2) return { tree, index: picked[0] ?? 0 };
  const children = tree.root.children;
  const group: SequenceNode = {
    type: "sequence",
    id: freeId(tree, "group"),
    order: "fixed",
    children: picked.map((i) => children[i]),
  };
  const rest = children.filter((_, i) => !picked.includes(i));
  const at = picked[0];
  rest.splice(at, 0, group);
  return { tree: withChildren(tree, rest), index: at };
}

/** Dissolve the group at `index` back into its children. */
export function ungroupAt(tree: ProtocolTree, index: number): ProtocolTree {
  const node = tree.root.children[index];
  if (!node || node.type === "block") return tree;
  const inner = node.type === "loop" ? node.template.children : node.children;
  const children = [...tree.root.children];
  children.splice(index, 1, ...inner);
  return withChildren(tree, children);
}

/** Turn a group into a `loop` (repetitions, a condition table) or back into a sequence. */
export function setGroupRepeat(
  node: GroupNode,
  repeat: boolean,
  columns: string[] = ["condition"],
  rows: Cell[][] = [["a"]]
): GroupNode {
  if (repeat && node.type === "sequence")
    return {
      type: "loop",
      id: node.id ?? "group",
      ...(node.label ? { label: node.label } : {}),
      template: { ...node, order: "fixed" },
      conditions: { columns, rows },
      order: "sequential",
      repetitions: 1,
      ...(node.max_run_same ? { max_run_same: node.max_run_same } : {}),
    };
  if (!repeat && node.type === "loop") return node.template;
  return node;
}

/** The structural blocks the bin offers, with a config that already validates. */
export const ELEMENTS: {
  kind: string;
  label: string;
  config: Record<string, unknown>;
}[] = [
  {
    kind: "instructions",
    label: "Instructions",
    config: {
      lines: [{ text: "Tell the participant what happens next.", holdMs: 2500 }],
      advance: { mode: "key", label: "Continue" },
    },
  },
  { kind: "fixation", label: "Fixation cross", config: { duration_s: 1 } },
  {
    kind: "baseline",
    label: "Resting baseline",
    config: { eyes: "open", duration_s: 60, end_tone: true },
  },
  {
    kind: "rest",
    label: "Rest",
    config: { mode: "timed", duration_s: 30 },
  },
  { kind: "countdown", label: "Countdown", config: { from: 3 } },
  {
    kind: "questionnaire",
    label: "How do you feel? (SAM)",
    config: { instrument: "sam" },
  },
];

/** A block for a media item the author dragged in from the bin. */
export function blockForMedia(tree: ProtocolTree, item: BinMedia): BlockNode {
  const kind = item.kind === "text" ? "text" : item.kind;
  return {
    type: "block",
    id: freeId(tree, item.title || kind),
    kind,
    label: item.title,
    config: { media_id: item.id },
  } as BlockNode;
}

/** A block for one of the structural elements. */
export function blockForElement(
  tree: ProtocolTree,
  element: (typeof ELEMENTS)[number]
): BlockNode {
  return {
    type: "block",
    id: freeId(tree, element.kind),
    kind: element.kind,
    label: element.label,
    config: { ...element.config },
  } as BlockNode;
}

/** The whole tree's estimated length, for the timeline's total. */
export function totalSeconds(
  tree: ProtocolTree,
  media: Record<string, BinMedia> = {}
): number {
  return clips(tree, media).reduce((total, clip) => total + clip.seconds, 0);
}

/** `12:30`, or `1:02:30` past an hour. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
