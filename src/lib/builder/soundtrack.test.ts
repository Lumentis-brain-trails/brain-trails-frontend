import { describe, expect, test } from "vitest";
import { clips as clipsOf } from "./draft";
import {
  addCue,
  laneSpan,
  moveCueStart,
  removeCue,
  setCueStop,
  updateCue,
} from "./soundtrack";
import type { BlockNode, ProtocolTree } from "@/lib/protocol/tree";

const MUSIC = "11111111-1111-1111-1111-111111111111";

const block = (id: string): BlockNode =>
  ({
    type: "block",
    id,
    kind: "rest",
    label: id,
    config: { mode: "timed", duration_s: 10 },
  }) as BlockNode;

/** intro | a group of two | outro - a clip is not always one block. */
const tree: ProtocolTree = {
  schema: 1,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: {
    type: "sequence",
    order: "fixed",
    children: [
      block("intro"),
      {
        type: "sequence",
        id: "pair",
        order: "fixed",
        children: [block("a"), block("b")],
      },
      block("outro"),
    ],
  },
  soundtrack: [],
};
const clips = clipsOf(tree, {});

describe("the soundtrack in the builder", () => {
  test("dropping a sound on a clip starts it with that clip's first block", () => {
    const { tree: next, id } = addCue(tree, clips, MUSIC, 1, "Rain");
    expect(next.schema).toBe(2); // a soundtrack is a schema 2 tree
    expect(next.soundtrack).toEqual([
      expect.objectContaining({
        id,
        label: "Rain",
        media_id: MUSIC,
        start: { block: "a", offset_s: 0 },
        stop: "clip_end",
      }),
    ]);
  });

  test("dropping past the last clip starts it with the protocol", () => {
    const { tree: next } = addCue(tree, clips, MUSIC, 99);
    expect(next.soundtrack[0].start).toEqual({ offset_s: 0 });
  });

  test("stopping at a clip means as its last block ends", () => {
    const { tree: added, id } = addCue(tree, clips, MUSIC, 0);
    const next = setCueStop(added, clips, id, 1);
    expect(next.soundtrack[0].stop).toEqual({ block: "b" });
    expect(laneSpan(next.soundtrack[0], clips)).toEqual({
      startClip: 0,
      endClip: 1,
    });
  });

  test("background music: from the start, looping, to the end", () => {
    const { tree: added, id } = addCue(tree, clips, MUSIC, 99);
    const next = updateCue(setCueStop(added, clips, id, "protocol_end"), id, {
      loop: true,
    });
    expect(next.soundtrack[0]).toMatchObject({
      loop: true,
      stop: "protocol_end",
    });
    expect(laneSpan(next.soundtrack[0], clips)).toEqual({
      startClip: 0,
      endClip: 2,
    });
  });

  test("stopping with the file undoes a loop, which could never reach it", () => {
    const { tree: added, id } = addCue(tree, clips, MUSIC, 0);
    const looped = updateCue(setCueStop(added, clips, id, "protocol_end"), id, {
      loop: true,
    });
    const next = setCueStop(looped, clips, id, "clip_end");
    expect(next.soundtrack[0]).toMatchObject({ loop: false, stop: "clip_end" });
  });

  test("moving a sound keeps its delay and its stop", () => {
    const { tree: added, id } = addCue(tree, clips, MUSIC, 0);
    const delayed = updateCue(added, id, {
      start: { block: "intro", offset_s: 3 },
    });
    const stopped = setCueStop(delayed, clips, id, 2);
    const moved = moveCueStart(stopped, clips, id, 1);
    expect(moved.soundtrack[0]).toMatchObject({
      start: { block: "a", offset_s: 3 },
      stop: { block: "outro" },
    });
  });

  test("two sounds get two ids; removing one leaves the other", () => {
    const first = addCue(tree, clips, MUSIC, 0);
    const second = addCue(first.tree, clips, MUSIC, 2);
    expect(second.id).not.toBe(first.id);
    expect(
      removeCue(second.tree, first.id).soundtrack.map((c) => c.id)
    ).toEqual([second.id]);
  });
});
