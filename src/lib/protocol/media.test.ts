import { describe, expect, test } from "vitest";
import { bindMedia, mediaIds } from "./media";
import type { ProtocolDefinition } from "./types";

const PLAN: ProtocolDefinition = {
  id: "p",
  version: 1,
  title: "P",
  steps: [
    { id: "intro", kind: "prompt", label: "i", config: { lines: [] } },
    {
      id: "clip",
      kind: "video",
      label: "c",
      config: { media_id: "m1", allowPause: false },
    },
    { id: "sound", kind: "audio", label: "s", config: { media_id: "m2" } },
    { id: "clip_again", kind: "video", label: "c", config: { media_id: "m1" } },
    { id: "empty", kind: "rest", label: "r", config: null },
  ],
};

const MEDIA = {
  m1: {
    url: "https://s3/m1.mp4",
    kind: "video",
    poster_url: "https://s3/m1.jpg",
    duration_s: 30,
  },
  m2: { url: "https://s3/m2.mp3", kind: "audio", poster_url: null },
};

describe("bindMedia", () => {
  test("adds src (and a video's poster) without touching the input", () => {
    const bound = bindMedia(PLAN, MEDIA);
    expect(bound.steps[1].config).toEqual({
      media_id: "m1",
      allowPause: false,
      src: "https://s3/m1.mp4",
      poster: "https://s3/m1.jpg",
    });
    expect(bound.steps[2].config).toEqual({
      media_id: "m2",
      src: "https://s3/m2.mp3",
    });
    expect(bound.steps[0]).toBe(PLAN.steps[0]);
    expect(PLAN.steps[1].config).toEqual({ media_id: "m1", allowPause: false });
  });

  test("a missing media id is an error naming the step", () => {
    expect(() => bindMedia(PLAN, { m1: MEDIA.m1 })).toThrow(
      /step "sound" \(audio\): media m2/
    );
  });

  test("an unsubstituted media id is an error too", () => {
    const plan = {
      ...PLAN,
      steps: [
        {
          id: "x",
          kind: "video",
          label: "x",
          config: { media_id: { $var: "clip" } },
        },
      ],
    };
    expect(() => bindMedia(plan, MEDIA)).toThrow(
      /step "x" \(video\): media_id must be a string/
    );
  });

  test("mediaIds lists each id once", () => {
    expect(mediaIds(PLAN)).toEqual(["m1", "m2"]);
  });
});
