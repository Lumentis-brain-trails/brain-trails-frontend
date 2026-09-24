/**
 * Editing the soundtrack from the builder (backend V3-0014), as pure functions.
 *
 * The lane under the timeline shows sounds over the top-level clips, but a sound is
 * anchored to *blocks*, not to clips: a clip may be a group of many blocks. So placing a
 * sound on a clip anchors its start to that clip's first block, and stopping it at a
 * clip anchors the stop to that clip's last block - "from the start of this to the end
 * of that", which is what dropping it there looks like.
 */
import type { Clip } from "./draft";
import type { Cue, ProtocolTree, TreeNode } from "@/lib/protocol/tree";
import { TREE_SCHEMA_VERSION } from "@/lib/protocol/tree";

/** Every block id under a node, in document order. */
export function blockIdsOf(node: TreeNode): string[] {
  if (node.type === "block") return [node.id];
  if (node.type === "sequence") return node.children.flatMap(blockIdsOf);
  return blockIdsOf(node.template);
}

/** The top-level clip a block sits in, or -1 when no clip holds it. */
export function clipOfBlock(clips: readonly Clip[], blockId: string): number {
  return clips.findIndex((clip) => blockIdsOf(clip.node).includes(blockId));
}

function firstBlock(clip: Clip | undefined): string | undefined {
  return clip ? blockIdsOf(clip.node)[0] : undefined;
}

function lastBlock(clip: Clip | undefined): string | undefined {
  const ids = clip ? blockIdsOf(clip.node) : [];
  return ids[ids.length - 1];
}

/** A tree with its soundtrack replaced, written at the schema the soundtrack needs. */
function withSoundtrack(tree: ProtocolTree, soundtrack: Cue[]): ProtocolTree {
  return { ...tree, schema: TREE_SCHEMA_VERSION, soundtrack };
}

/** An id no other sound uses: `sound_1`, `sound_2`, ... */
export function nextCueId(soundtrack: readonly Cue[]): string {
  const taken = new Set(soundtrack.map((cue) => cue.id));
  let n = soundtrack.length + 1;
  while (taken.has(`sound_${n}`)) n += 1;
  return `sound_${n}`;
}

/**
 * Add a sound where it was dropped: starting with that clip's first block.
 *
 * It stops with the file by default - the least surprising thing a new sound can do. A
 * drop past the last clip, or on an empty timeline, starts it with the protocol.
 */
export function addCue(
  tree: ProtocolTree,
  clips: readonly Clip[],
  mediaId: string,
  clipIndex: number,
  label?: string
): { tree: ProtocolTree; id: string } {
  const soundtrack = tree.soundtrack ?? [];
  const id = nextCueId(soundtrack);
  const block = firstBlock(clips[clipIndex]);
  const cue: Cue = {
    id,
    ...(label ? { label } : {}),
    media_id: mediaId,
    start: block ? { block, offset_s: 0 } : { offset_s: 0 },
    stop: "clip_end",
    loop: false,
    volume: 0.6,
    fade_s: 1,
  };
  return { tree: withSoundtrack(tree, [...soundtrack, cue]), id };
}

export function updateCue(
  tree: ProtocolTree,
  id: string,
  patch: Partial<Cue>
): ProtocolTree {
  return withSoundtrack(
    tree,
    (tree.soundtrack ?? []).map((cue) =>
      cue.id === id ? { ...cue, ...patch } : cue
    )
  );
}

export function removeCue(tree: ProtocolTree, id: string): ProtocolTree {
  return withSoundtrack(
    tree,
    (tree.soundtrack ?? []).filter((cue) => cue.id !== id)
  );
}

/** Move a sound's start to another clip; its delay is kept, its stop is left alone. */
export function moveCueStart(
  tree: ProtocolTree,
  clips: readonly Clip[],
  id: string,
  clipIndex: number
): ProtocolTree {
  const cue = (tree.soundtrack ?? []).find((c) => c.id === id);
  if (!cue) return tree;
  const block = firstBlock(clips[clipIndex]);
  const offset = cue.start?.offset_s ?? 0;
  return updateCue(tree, id, {
    start: block ? { block, offset_s: offset } : { offset_s: offset },
  });
}

/**
 * Stop a sound as a clip ends (its last block), or with the protocol or the file.
 *
 * Stopping at "the file" undoes a loop, since a looping sound never reaches the end of
 * its file; the validator would refuse the combination, so the builder never makes it.
 */
export function setCueStop(
  tree: ProtocolTree,
  clips: readonly Clip[],
  id: string,
  where: number | "protocol_end" | "clip_end"
): ProtocolTree {
  if (where === "protocol_end")
    return updateCue(tree, id, { stop: "protocol_end" });
  if (where === "clip_end")
    return updateCue(tree, id, { stop: "clip_end", loop: false });
  const block = lastBlock(clips[where]);
  return updateCue(tree, id, {
    stop: block ? { block } : "protocol_end",
  });
}

/** Where a sound sits on the lane, in clip columns, for drawing it. */
export interface LaneSpan {
  /** The clip it starts over; 0 when it starts with the protocol. */
  startClip: number;
  /** The clip it stops over, inclusive; null when it runs to its file's end. */
  endClip: number | null;
}

export function laneSpan(cue: Cue, clips: readonly Clip[]): LaneSpan {
  const startClip = cue.start?.block
    ? Math.max(0, clipOfBlock(clips, cue.start.block))
    : 0;
  if (cue.stop === "clip_end") return { startClip, endClip: null };
  if (cue.stop === "protocol_end")
    return { startClip, endClip: Math.max(startClip, clips.length - 1) };
  const at = clipOfBlock(clips, cue.stop.block);
  return {
    startClip,
    endClip: at < 0 ? clips.length - 1 : Math.max(startClip, at),
  };
}
