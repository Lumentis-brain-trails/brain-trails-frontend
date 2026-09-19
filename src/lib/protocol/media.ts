/**
 * Media binding: library media ids -> the URLs a renderer can load.
 *
 * A stored protocol never holds a URL (backend decision V3-0004): presigned URLs expire,
 * and a protocol version outlives any of them. Blocks name library media by `media_id`;
 * the session start (and `GET /sessions/{id}/media-urls` when they need renewing) returns
 * a map from those ids to fresh URLs, and this binds them onto a resolved plan just
 * before it runs. Kinds keep accepting a plain `src`, so today's URL-based definitions
 * stay valid.
 */

import type { ProtocolDefinition, ProtocolStep } from "./types";

/** One entry of the session's media map. */
export interface BoundMedia {
  url: string;
  kind: string;
  poster_url?: string | null;
  duration_s?: number | null;
  /** A text item's passage, which has no file to link to. */
  body?: string | null;
}

function bindStep(
  step: ProtocolStep,
  media: Record<string, BoundMedia>
): ProtocolStep {
  const config = step.config as Record<string, unknown> | null;
  if (!config || typeof config !== "object" || !("media_id" in config))
    return step;
  const id = config.media_id;
  if (typeof id !== "string")
    throw new Error(
      `step "${step.id}" (${step.kind}): media_id must be a string, got ${JSON.stringify(id)}`
    );
  const entry = media[id];
  if (!entry)
    throw new Error(
      `step "${step.id}" (${step.kind}): media ${id} is not in the session's media`
    );
  return {
    ...step,
    config: {
      ...config,
      ...(entry.body ? { body: entry.body } : { src: entry.url }),
      ...(step.kind === "video" && entry.poster_url
        ? { poster: entry.poster_url }
        : {}),
    },
  };
}

/**
 * Return a copy of `plan` whose media-backed steps carry `config.src` (and `poster` for
 * a video with one). Pure; `plan` is not modified.
 *
 * Throws naming the first step whose `media_id` is missing from `media`: running a
 * protocol with a hole in it would fail mid-session, in front of the participant.
 */
export function bindMedia(
  plan: ProtocolDefinition,
  media: Record<string, BoundMedia>
): ProtocolDefinition {
  return { ...plan, steps: plan.steps.map((step) => bindStep(step, media)) };
}

/** Every media id a plan references, e.g. to preload or to renew URLs. */
export function mediaIds(plan: ProtocolDefinition): string[] {
  const ids = new Set<string>();
  for (const step of plan.steps) {
    const id = (step.config as { media_id?: unknown } | null)?.media_id;
    if (typeof id === "string") ids.add(id);
  }
  return [...ids];
}
