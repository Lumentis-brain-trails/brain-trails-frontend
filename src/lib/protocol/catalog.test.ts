import { expect, test } from "vitest";
import type { Media } from "@/lib/types";
import { protocolFor } from "./catalog";

const base: Media = {
  id: "m1",
  kind: "video",
  visibility: "workspace",
  status: "ready",
  access: "open",
  tags: [],
  slug: "calm-sea",
  title: "Calm sea",
  description: null,
  module: null,
  manifest: {},
  definition: {},
  duration_s: 60,
  language: null,
  review_state: "none",
  probe: {},
  created_at: "2026-09-19T00:00:00Z",
  mine: true,
  url: "https://example.com/v.mp4",
  cover_url: null,
};

test("a video plays as a one-block protocol", () => {
  const resolved = protocolFor(base);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) return;
  expect(resolved.protocol.steps).toHaveLength(1);
  expect(resolved.protocol.steps[0].kind).toBe("video");
  expect(resolved.protocol.title).toBe("Calm sea");
});

test("a video without a link cannot play", () => {
  expect(protocolFor({ ...base, url: null }).ok).toBe(false);
});

test("a module-backed item plays its module", () => {
  const resolved = protocolFor({
    ...base,
    kind: "game",
    module: "signal-navigator-v1",
    url: null,
  });
  expect(resolved.ok && resolved.protocol.id).toBe("signal-navigator");
});
