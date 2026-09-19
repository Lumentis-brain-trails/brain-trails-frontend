/**
 * The catalog's view of the media table (plan V3, sprint S16).
 *
 * Until protocols are rows of their own (S18), what the catalog shows as a protocol is
 * either a module-backed item (Signal Navigator) or an open video, which plays as an
 * implicit one-block protocol. This module turns an item into something the runner can
 * run.
 */
// Registers the task kinds: validating a protocol needs them, and a page that only
// shows a protocol (its detail page) would otherwise validate against none.
import "@/components/protocol/kinds";
import type { Media } from "@/lib/types";
import { type ResolvedProtocol, resolveProtocol } from "./session";
import { safeParseProtocol } from "./schema";

/** A video as a one-block protocol: the video, from its short-lived link. */
export function videoProtocol(item: Media): ResolvedProtocol {
  if (!item.url)
    return { ok: false, error: "This video has no playable file." };
  return safeParseProtocol({
    id: `video-${item.slug}`,
    version: 1,
    title: item.title,
    ...(item.manifest.content_warning
      ? { contentWarning: item.manifest.content_warning }
      : {}),
    startMarker: "session_start",
    endMarker: "session_end",
    steps: [
      {
        id: "video",
        kind: "video",
        label: item.title,
        startMarker: "stimulus_onset",
        endMarker: "stimulus_offset",
        config: { src: item.url },
      },
    ],
  });
}

/** What the runner plays for a catalog item. */
export function protocolFor(item: Media): ResolvedProtocol {
  if (item.kind === "video") return videoProtocol(item);
  return resolveProtocol(item.module, item.definition);
}
