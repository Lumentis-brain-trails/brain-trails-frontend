import { describe, expect, test } from "vitest";
import { bindMedia, mediaIds } from "./media";
import { planSoundtrack, resolvePlan } from "./resolve";
import type { ProtocolStep } from "./types";

const MUSIC = "11111111-1111-1111-1111-111111111111";
const VOICE = "22222222-2222-2222-2222-222222222222";

const block = (id: string) => ({
  type: "block",
  id,
  kind: "rest",
  label: id,
  config: { mode: "timed", duration_s: 5 },
});

const tree = (soundtrack: unknown[]) => ({
  schema: 2,
  manifest: {},
  root: {
    type: "sequence",
    children: [block("intro"), block("rest"), block("outro")],
  },
  soundtrack,
});

const META = { id: "p", version: 1, title: "P" };

describe("the soundtrack in a plan", () => {
  test("background music starts with the run and ends with it", () => {
    const plan = resolvePlan(
      tree([{ id: "bed", media_id: MUSIC, loop: true, stop: "protocol_end" }]),
      1,
      META
    );
    expect(plan.soundtrack).toEqual([
      expect.objectContaining({
        id: "bed",
        startStep: null,
        stop: { kind: "protocol_end" },
        loop: true,
        volume: 0.6,
      }),
    ]);
  });

  test("a sound anchored to blocks gets the steps those blocks became", () => {
    const plan = resolvePlan(
      tree([
        {
          id: "voice",
          media_id: VOICE,
          start: { block: "rest", offset_s: 2 },
          stop: { block: "outro" },
        },
      ]),
      1,
      META
    );
    const restAt = plan.steps.findIndex((s) => s.block?.block_id === "rest");
    const outroAt = plan.steps.findIndex((s) => s.block?.block_id === "outro");
    expect(plan.soundtrack?.[0]).toMatchObject({
      startStep: restAt,
      offsetS: 2,
      stop: { kind: "step", step: outroAt },
    });
  });

  test("a tree without a soundtrack plans exactly as before", () => {
    const plan = resolvePlan(
      {
        schema: 1,
        manifest: {},
        root: { type: "sequence", children: [block("a")] },
      },
      1,
      META
    );
    expect("soundtrack" in plan).toBe(false);
  });

  test("a start that never appears drops the sound; a stop that never appears ends with the run", () => {
    const steps = [
      {
        id: "a",
        kind: "rest",
        label: "a",
        config: {},
        block: { block_id: "a", node_path: "a", iteration: null },
      },
    ] as ProtocolStep[];
    const planned = planSoundtrack(
      [
        {
          id: "ghost",
          media_id: VOICE,
          start: { block: "nowhere", offset_s: 0 },
          stop: "clip_end",
          loop: false,
          volume: 0.6,
          fade_s: 1,
        },
        {
          id: "late",
          media_id: MUSIC,
          start: { offset_s: 0 },
          stop: { block: "nowhere" },
          loop: true,
          volume: 0.3,
          fade_s: 2,
        },
      ],
      steps
    );
    expect(planned.map((c) => c.id)).toEqual(["late"]);
    expect(planned[0].stop).toEqual({ kind: "protocol_end" });
  });

  test("the soundtrack's files are fetched and bound like a block's", () => {
    const plan = resolvePlan(
      tree([{ id: "bed", media_id: MUSIC, loop: true, stop: "protocol_end" }]),
      1,
      META
    );
    expect(mediaIds(plan)).toContain(MUSIC);
    const bound = bindMedia(plan, {
      [MUSIC]: { url: "https://s3/bed.mp3", kind: "audio" },
    });
    expect(bound.soundtrack?.[0].src).toBe("https://s3/bed.mp3");
    expect(() => bindMedia(plan, {})).toThrow(/bed/);
  });
});
