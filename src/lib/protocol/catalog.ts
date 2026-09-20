/**
 * The catalog's protocols (backend V3-0004, S18) and how a started session becomes a
 * plan the runner can execute.
 *
 * A protocol is a row of its own now: the catalog and the detail page read
 * `/protocols`, and Play starts a session that returns the version's tree, the seed and
 * links to the media it plays. `planFor` spends all the structure before the first block
 * - loops, shuffles, fixations - binds the media links and validates every block against
 * its kind, so nothing malformed reaches a renderer mid-run.
 */
// Registers the task kinds: validating a plan needs them, and a page that only shows a
// protocol would otherwise validate against none.
import "@/components/protocol/kinds";
import type { components } from "@/lib/api-types";
import { bindMedia } from "./media";
import { resolvePlan } from "./resolve";
import { safeParseProtocol } from "./schema";
import type { ResolvedProtocol, StimulusSessionStart } from "./session";

export type ProtocolCard = components["schemas"]["ProtocolCard"];
export type ProtocolDetail = components["schemas"]["ProtocolDetail"];
export type OutlineItem = components["schemas"]["OutlineItem"];
export type ValidationResult = components["schemas"]["ValidationOut"];

/** Whether a card can be played (locked cards are advertised, not runnable). */
export function isPlayable(card: ProtocolCard): boolean {
  return (
    card.access === "open" && card.current_version !== null && !card.archived
  );
}

/** The plan a started session runs: resolved by its seed, media bound, validated. */
export function planFor(session: StimulusSessionStart): ResolvedProtocol {
  try {
    const plan = resolvePlan(session.definition, session.seed, {
      id: session.protocol_id ?? session.id,
      version: session.protocol_version ?? 0,
      title: session.title,
    });
    const media = Object.fromEntries(
      Object.entries(session.media).map(([id, link]) => [
        id,
        {
          url: link.url ?? "",
          kind: link.kind,
          poster_url: link.poster_url,
          duration_s: link.duration_s,
          body: link.body,
        },
      ])
    );
    return safeParseProtocol(bindMedia(plan, media));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Minutes, rounded, for a card or a detail page; null when unknown. */
export function formatMinutes(
  seconds: number | null | undefined
): string | null {
  if (seconds == null) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 1 ? `${minutes} min` : `${Math.round(seconds)} s`;
}
