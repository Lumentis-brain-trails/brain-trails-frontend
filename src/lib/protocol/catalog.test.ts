import { expect, test } from "vitest";
import type { StimulusSessionStart } from "./session";
import { formatMinutes, isPlayable, planFor } from "./catalog";
import type { ProtocolCard } from "./catalog";

const card: ProtocolCard = {
  id: "p1",
  workspace_id: "w1",
  slug: "calm-sea",
  title: "Calm sea",
  summary: null,
  cover_url: null,
  preview_url: null,
  visibility: "workspace",
  access: "open",
  review_state: "none",
  tags: [],
  language: null,
  current_version: 1,
  est_duration_s: 120,
  content_warning: null,
  mine: true,
  archived: false,
  created_at: "2026-09-19T00:00:00Z",
};

const session = (
  over: Partial<StimulusSessionStart> = {}
): StimulusSessionStart =>
  ({
    id: "s1",
    status: "running",
    protocol_id: "p1",
    protocol_version: 1,
    title: "Calm sea",
    recording_id: "r1",
    seed: 7,
    params: {},
    summary: {},
    n_events: 0,
    started_at: "2026-09-19T00:00:00Z",
    ended_at: null,
    capture: "upload",
    protocol_version_id: "v1",
    manifest: {},
    media: {
      "11111111-1111-4111-8111-111111111111": {
        url: "https://example.com/v.mp4",
        kind: "video",
        poster_url: null,
        duration_s: 60,
      },
    },
    media_expires_at: "2026-09-19T01:00:00Z",
    definition: {
      schema: 1,
      manifest: {},
      root: {
        type: "sequence",
        children: [
          {
            type: "block",
            id: "clip",
            kind: "video",
            label: "Calm sea",
            config: { media_id: "11111111-1111-4111-8111-111111111111" },
          },
        ],
      },
    },
    ...over,
  }) as StimulusSessionStart;

test("a started session becomes a plan with its media bound", () => {
  const resolved = planFor(session());
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) return;
  expect(resolved.protocol.steps).toHaveLength(1);
  expect(resolved.protocol.steps[0].kind).toBe("video");
  expect(resolved.protocol.steps[0].config).toMatchObject({
    src: "https://example.com/v.mp4",
  });
});

test("a media link missing from the session is an error, not a broken run", () => {
  const resolved = planFor(session({ media: {} }));
  expect(resolved.ok).toBe(false);
});

test("a card is playable only when it is open and published", () => {
  expect(isPlayable(card)).toBe(true);
  expect(isPlayable({ ...card, current_version: null })).toBe(false);
  expect(isPlayable({ ...card, access: "locked" })).toBe(false);
  expect(isPlayable({ ...card, archived: true })).toBe(false);
});

test("durations read as minutes, or seconds when short", () => {
  expect(formatMinutes(120)).toBe("2 min");
  expect(formatMinutes(20)).toBe("20 s");
  expect(formatMinutes(null)).toBeNull();
});
