import { expect, test } from "vitest";
import type { WireEvent } from "@/lib/protocol/marker";
import {
  blockAt,
  mediaTimeAt,
  mediaWindows,
  parseTimeline,
  runBlocks,
  sessionTimeAt,
  ticks,
} from "./timeline";

const event = (
  t: number,
  type: string,
  meta: Record<string, unknown> = {}
): WireEvent => ({ t, type, payload: { meta } });

const timeline: WireEvent[] = [
  event(0, "session_start"),
  event(1, "block_start", { block_id: "base", step_id: "base" }),
  event(61, "block_end", { block_id: "base" }),
  event(61.5, "block_start", { block_id: "clip", step_id: "clip" }),
  event(62, "stimulus_onset", {
    block_id: "clip",
    media_id: "m1",
    media_time_ms: 0,
  }),
  event(70, "pause", { block_id: "clip" }),
  event(75, "stimulus_onset", {
    block_id: "clip",
    media_id: "m1",
    media_time_ms: 8000,
  }),
  event(90, "block_end", { block_id: "clip" }),
  event(91, "block_start", { block_id: "sam", step_id: "sam" }),
  event(99, "questionnaire_answer", { block_id: "sam", item: "valence" }),
];

const plan = {
  steps: [
    { id: "base", label: "Resting baseline", kind: "baseline" },
    { id: "clip", label: "Calm sea", kind: "video" },
    { id: "sam", label: "How do you feel?", kind: "questionnaire" },
  ],
};

test("blocks come back in order, with the plan's words and their span", () => {
  const blocks = runBlocks(timeline, plan);
  expect(blocks.map((b) => b.blockId)).toEqual(["base", "clip", "sam"]);
  expect(blocks[0]).toMatchObject({
    label: "Resting baseline",
    kind: "baseline",
    tStart: 1,
    tEnd: 61,
  });
  // a block that never ended is open, not dropped
  expect(blocks[2].tEnd).toBeNull();
});

test("a video's window says which media time was on screen when", () => {
  const blocks = runBlocks(timeline, plan);
  const windows = mediaWindows(timeline, blocks);
  // the pause cuts the first window; the second onset opens a new one
  expect(windows).toHaveLength(2);
  expect(windows[0]).toMatchObject({ tStart: 62, tEnd: 70, mediaStart: 0 });
  expect(windows[1]).toMatchObject({ tStart: 75, tEnd: 90, mediaStart: 8 });

  expect(mediaTimeAt(windows, 65)?.mediaTime).toBe(3);
  expect(mediaTimeAt(windows, 80)?.mediaTime).toBe(13);
  // nothing was playing during the baseline or between the pause and the resume
  expect(mediaTimeAt(windows, 30)).toBeNull();
  expect(mediaTimeAt(windows, 72)).toBeNull();
});

test("seeking in the video maps back to the session clock", () => {
  const windows = mediaWindows(timeline, runBlocks(timeline, plan));
  expect(sessionTimeAt(windows, "clip", 3)).toBe(65);
  expect(sessionTimeAt(windows, "clip", 13)).toBe(80);
  expect(sessionTimeAt(windows, "clip", 999)).toBeNull();
});

test("the block on screen at a moment, and the ticks worth drawing", () => {
  const blocks = runBlocks(timeline, plan);
  expect(blockAt(blocks, 30)?.blockId).toBe("base");
  expect(blockAt(blocks, 80)?.blockId).toBe("clip");
  expect(blockAt(blocks, 61.2)).toBeNull();
  expect(ticks(timeline).map((tick) => tick.type)).toEqual([
    "stimulus_onset",
    "pause",
    "stimulus_onset",
    "questionnaire_answer",
  ]);
});

test("the stored timeline parses line by line, and survives a broken line", () => {
  const text = `{"t":1,"type":"a","payload":{}}\nnot json\n{"t":0,"type":"b","payload":{}}\n`;
  const events = parseTimeline(text);
  expect(events.map((e) => e.type)).toEqual(["b", "a"]); // sorted by time
});
