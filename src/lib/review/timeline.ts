/**
 * Reading a finished session back: blocks, and the video's own clock (sprint S20).
 *
 * A recording, its trail and the video that played are three clocks. The EEG and the
 * trail share one - the session clock of V1-0001, seconds from the first sample - and
 * the markers are stamped on it. A video has its own `currentTime`, which drifts from
 * the session clock whenever it stalls, is paused or starts late. The only honest
 * mapping is the one the run itself recorded: `stimulus_onset` carries `media_time_ms`,
 * so a video block's window says "this media time was on screen at this session time",
 * and transport events (`play`, `pause`, `seek`) cut the window where the mapping stops
 * holding.
 *
 * Everything here is pure: the review page feeds it the stored timeline and gets back
 * what to draw and where to seek.
 */

import type { WireEvent } from "@/lib/protocol/marker";

/** One block as it ran: what the plan called it, and when it was on screen. */
export interface RunBlock {
  blockId: string;
  label: string;
  kind: string;
  condition?: string;
  iteration?: number | null;
  tStart: number;
  /** Null while the block never ended (a run cut short). */
  tEnd: number | null;
}

/** A stretch of session time during which a video played continuously. */
export interface MediaWindow {
  blockId: string;
  mediaId?: string;
  /** Session seconds at which the window starts. */
  tStart: number;
  tEnd: number;
  /** Media seconds shown at `tStart`. */
  mediaStart: number;
}

function meta(event: WireEvent): Record<string, unknown> {
  const payload = event.payload as { meta?: unknown };
  return (payload.meta as Record<string, unknown>) ?? event.payload;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The blocks of a run, in order, from its `block_start` / `block_end` pairs.
 *
 * `plan` (the session's stored `resolved_plan`) supplies the labels: the timeline
 * carries ids, the plan carries the words the author wrote.
 */
export function runBlocks(
  events: WireEvent[],
  plan?: { steps?: { id: string; label?: string; kind?: string }[] } | null
): RunBlock[] {
  const labels = new Map<string, { label?: string; kind?: string }>();
  for (const step of plan?.steps ?? [])
    labels.set(step.id, { label: step.label, kind: step.kind });

  const open = new Map<string, RunBlock>();
  const blocks: RunBlock[] = [];
  for (const event of events) {
    if (event.type !== "block_start" && event.type !== "block_end") continue;
    const m = meta(event);
    const blockId = str(m.block_id) ?? str(m.step_id) ?? "";
    if (!blockId) continue;
    if (event.type === "block_start") {
      const known = labels.get(str(m.step_id) ?? blockId) ?? {};
      const block: RunBlock = {
        blockId,
        label: known.label ?? str(m.label) ?? blockId,
        kind: known.kind ?? str(m.task_kind) ?? "block",
        ...(str(m.condition) ? { condition: str(m.condition) } : {}),
        iteration: num(m.iteration) ?? null,
        tStart: event.t,
        tEnd: null,
      };
      open.set(blockId, block);
      blocks.push(block);
    } else {
      const block = open.get(blockId);
      if (block) {
        block.tEnd = event.t;
        open.delete(blockId);
      }
    }
  }
  return blocks;
}

const STOPS = new Set(["pause", "seek", "stall", "media_stall", "ended"]);

/**
 * When each video was on screen, and at which media time it was.
 *
 * A window opens at a `stimulus_onset` that carries `media_time_ms` and closes at the
 * next transport event, the block's end, or the next onset - never later, because after
 * a pause or a seek the linear mapping no longer holds.
 */
export function mediaWindows(
  events: WireEvent[],
  blocks: RunBlock[]
): MediaWindow[] {
  const endOf = new Map(blocks.map((b) => [b.blockId, b.tEnd]));
  const windows: MediaWindow[] = [];
  let current: MediaWindow | null = null;

  const close = (t: number) => {
    if (current && t > current.tStart) {
      current.tEnd = t;
      windows.push(current);
    }
    current = null;
  };

  for (const event of events) {
    const m = meta(event);
    const mediaTime = num(m.media_time_ms);
    if (event.type === "stimulus_onset" && mediaTime !== undefined) {
      close(event.t);
      const blockId = str(m.block_id) ?? str(m.step_id) ?? "";
      current = {
        blockId,
        ...(str(m.media_id) ? { mediaId: str(m.media_id) } : {}),
        tStart: event.t,
        tEnd: endOf.get(blockId) ?? event.t,
        mediaStart: mediaTime / 1000,
      };
    } else if (
      current &&
      (STOPS.has(event.type) || event.type === "block_end")
    ) {
      close(event.t);
    }
  }
  close(Number.POSITIVE_INFINITY);
  return windows.map((w) => ({
    ...w,
    tEnd: Number.isFinite(w.tEnd) ? w.tEnd : w.tStart,
  }));
}

/** The window covering a session time, or null when no video was playing then. */
export function windowAt(
  windows: MediaWindow[],
  tSession: number
): MediaWindow | null {
  return (
    windows.find((w) => tSession >= w.tStart && tSession <= w.tEnd) ?? null
  );
}

/** Media seconds to show for a session time, or null when no video covers it. */
export function mediaTimeAt(
  windows: MediaWindow[],
  tSession: number
): { mediaId?: string; blockId: string; mediaTime: number } | null {
  const window = windowAt(windows, tSession);
  if (!window) return null;
  return {
    ...(window.mediaId ? { mediaId: window.mediaId } : {}),
    blockId: window.blockId,
    mediaTime: window.mediaStart + (tSession - window.tStart),
  };
}

/** The session time at which a video's `mediaTime` was on screen. */
export function sessionTimeAt(
  windows: MediaWindow[],
  blockId: string,
  mediaTime: number
): number | null {
  const window = windows.find(
    (w) =>
      w.blockId === blockId &&
      mediaTime >= w.mediaStart &&
      mediaTime <= w.mediaStart + (w.tEnd - w.tStart)
  );
  return window ? window.tStart + (mediaTime - window.mediaStart) : null;
}

/** The block on screen at a session time. */
export function blockAt(blocks: RunBlock[], tSession: number): RunBlock | null {
  return (
    blocks.find(
      (b) => tSession >= b.tStart && (b.tEnd === null || tSession <= b.tEnd)
    ) ?? null
  );
}

/** Events worth a tick on the timeline: onsets, responses, answers, quality drops. */
export const TICK_TYPES = new Set([
  "stimulus_onset",
  "stimulus_offset",
  "response",
  "questionnaire_answer",
  "quality_drop",
  "quality_recover",
  "pause",
  "resume",
]);

export function ticks(events: WireEvent[]): { t: number; type: string }[] {
  return events
    .filter((event) => TICK_TYPES.has(event.type))
    .map((event) => ({ t: event.t, type: event.type }));
}

/** Parse the stored JSONL timeline (one event per line). */
export function parseTimeline(text: string): WireEvent[] {
  const events: WireEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as WireEvent;
      if (typeof event.t === "number" && typeof event.type === "string")
        events.push(event);
    } catch {
      // one malformed line must not cost the rest of the timeline
    }
  }
  return events.sort((a, b) => a.t - b.t);
}
