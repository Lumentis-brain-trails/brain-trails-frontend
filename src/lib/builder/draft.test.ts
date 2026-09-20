import { expect, test } from "vitest";
import { getTaskKind } from "@/lib/protocol/registry";
import { registerBuiltInKinds } from "@/components/protocol/kinds";
import type { BlockNode, ProtocolTree } from "@/lib/protocol/tree";
import {
  ELEMENTS,
  blockForElement,
  blockForMedia,
  clipSeconds,
  clips,
  duplicateAt,
  formatClock,
  freeId,
  groupClips,
  insertAt,
  labelOf,
  moveClip,
  removeAt,
  replaceAt,
  setGroupRepeat,
  totalSeconds,
  ungroupAt,
} from "./draft";

/** A rest block by default; another kind brings its own config, not the rest's. */
const block = (id: string, kind = "rest", config?: object): BlockNode =>
  ({
    type: "block",
    id,
    kind,
    label: id,
    config: config ?? { mode: "timed", duration_s: 30 },
  }) as BlockNode;

const tree = (...children: BlockNode[]): ProtocolTree => ({
  schema: 1,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: { type: "sequence", order: "fixed", children },
});

test("clips read the root's children, with an estimated length each", () => {
  const t = tree(block("a"), block("b", "countdown", { from: 5 }));
  const [first, second] = clips(t);
  expect(first.label).toBe("a");
  expect(first.seconds).toBe(30);
  expect(second.seconds).toBe(5);
  expect(totalSeconds(t)).toBe(35);
});

test("a media block is as long as its media, and a self-paced one is marked variable", () => {
  const withMedia = tree({
    ...block("clip", "video"),
    config: { media_id: "m1" },
  } as BlockNode);
  const media = {
    m1: { id: "m1", kind: "video", title: "Sea", duration_s: 90 },
  };
  expect(clipSeconds(withMedia.root.children[0], media)).toBe(90);
  const free = tree(block("free", "rest", { mode: "self_paced" }));
  expect(clips(free)[0].variable).toBe(true);
});

test("lead-in and tail count towards a clip's width", () => {
  const padded: BlockNode = {
    ...block("x"),
    pre_fixation_s: 2,
    jitter_s: 4,
    post_rest_s: 10,
  };
  expect(clipSeconds(padded)).toBe(30 + 2 + 2 + 10);
});

test("insert, move and remove keep the rest of the tree untouched", () => {
  const t = tree(block("a"), block("b"));
  const inserted = insertAt(t, 1, block("c"));
  expect(inserted.root.children.map((c) => c.id)).toEqual(["a", "c", "b"]);
  expect(t.root.children.map((c) => c.id)).toEqual(["a", "b"]); // pure
  expect(moveClip(inserted, 0, 2).root.children.map((c) => c.id)).toEqual([
    "c",
    "b",
    "a",
  ]);
  expect(removeAt(inserted, 1).root.children.map((c) => c.id)).toEqual([
    "a",
    "b",
  ]);
  expect(replaceAt(t, 0, block("z")).root.children[0].id).toBe("z");
});

test("a duplicate lands next to its original with a free id", () => {
  const t = duplicateAt(tree(block("a"), block("b")), 0);
  expect(t.root.children.map((c) => c.id)).toEqual(["a", "a-copy", "b"]);
  const twice = duplicateAt(t, 0);
  expect(twice.root.children.map((c) => c.id)).toEqual([
    "a",
    "a-copy-2",
    "a-copy",
    "b",
  ]);
});

test("grouping folds the selected clips into one, in timeline order", () => {
  const t = tree(block("a"), block("b"), block("c"));
  const { tree: grouped, index } = groupClips(t, [2, 0]);
  expect(index).toBe(0);
  expect(grouped.root.children).toHaveLength(2);
  const group = grouped.root.children[0];
  expect(group.type).toBe("sequence");
  if (group.type !== "sequence") return;
  expect(group.children.map((c) => c.id)).toEqual(["a", "c"]);
  expect(clips(grouped)[0].count).toBe(2);
  expect(ungroupAt(grouped, 0).root.children.map((c) => c.id)).toEqual([
    "a",
    "c",
    "b",
  ]);
});

test("a group that repeats becomes a loop, and stops being one when it does not", () => {
  const t = groupClips(tree(block("a"), block("b")), [0, 1]).tree;
  const group = t.root.children[0];
  if (group.type === "block") throw new Error("expected a group");
  const loop = setGroupRepeat(group, true, ["clip"], [["x"], ["y"]]);
  expect(loop.type).toBe("loop");
  if (loop.type !== "loop") return;
  expect(loop.conditions.rows).toHaveLength(2);
  const asClip = clips({ ...t, root: { ...t.root, children: [loop] } })[0];
  expect(asClip.count).toBe(4); // two blocks x two rows
  expect(setGroupRepeat(loop, false).type).toBe("sequence");
});

test("new ids never collide with what the tree already holds", () => {
  const t = tree(block("rest"), block("rest-2"));
  expect(freeId(t, "rest")).toBe("rest-3");
  expect(freeId(t, "Free recording!")).toBe("free_recording");
});

test("the bin's elements and media produce blocks that carry their source", () => {
  const t = tree(block("a"));
  const element = blockForElement(t, ELEMENTS[0]);
  expect(element.kind).toBe("instructions");
  expect(element.config).toHaveProperty("lines");
  const media = blockForMedia(t, {
    id: "m1",
    kind: "video",
    title: "Calm sea",
    duration_s: 12,
  });
  expect(media.kind).toBe("video");
  expect(media.config).toEqual({ media_id: "m1" });
  expect(media.label).toBe("Calm sea");
  expect(labelOf(media)).toBe("Calm sea");
});

test("the clock reads minutes, and hours when there are any", () => {
  expect(formatClock(90)).toBe("1:30");
  expect(formatClock(3723)).toBe("1:02:03");
});

test("every element the bin offers is a block its own kind accepts", () => {
  registerBuiltInKinds();
  for (const element of ELEMENTS) {
    const parsed = getTaskKind(element.kind).configSchema.safeParse(
      element.config
    );
    expect(parsed.success, element.kind).toBe(true);
  }
});
