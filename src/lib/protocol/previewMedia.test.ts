import { describe, expect, test } from "vitest";
import { bindMedia } from "./media";
import { toBoundMedia } from "./previewMedia";
import type { ProtocolDefinition } from "./types";

const VIDEO = "01ed8df9-81d4-4cb2-8bd5-243403195f12";
const TEXT = "7d3f8aef-8cd6-4a28-a515-a1702e4f90c5";

/** Andrea's protocol in prod, reduced: two library videos named by id and nothing else. */
const plan = {
  id: "preview",
  version: 0,
  title: "Preview",
  steps: [
    { id: "clip_1", kind: "video", config: { media_id: VIDEO } },
    { id: "passage", kind: "text", config: { media_id: TEXT } },
  ],
} as unknown as ProtocolDefinition;

describe("preview media", () => {
  test("a library video gets the file it needs to play, and its cover", () => {
    const bound = bindMedia(plan, {
      [VIDEO]: toBoundMedia({
        id: VIDEO,
        kind: "video",
        url: "https://s3/clip-1.mp4",
        cover_url: "https://s3/clip-1.jpg",
        duration_s: 62.2,
      }),
      [TEXT]: toBoundMedia({
        id: TEXT,
        kind: "text",
        definition: { body: "Read this slowly." },
      }),
    });
    const [video, text] = bound.steps;
    // What was missing: without `src` the runner fell over at the first video block.
    expect(video.config).toMatchObject({
      media_id: VIDEO,
      src: "https://s3/clip-1.mp4",
      poster: "https://s3/clip-1.jpg",
    });
    // A text carries its passage, the way the session's media map gives it.
    expect(text.config).toMatchObject({ body: "Read this slowly." });
  });

  test("a hole is named rather than played", () => {
    expect(() => bindMedia(plan, {})).toThrow(/clip_1/);
  });
});
