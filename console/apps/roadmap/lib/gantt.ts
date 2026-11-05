/**
 * The roadmap's pure helpers: the API's shapes, days as numbers, the span the chart
 * covers, week and month ticks, items grouped by track, what is late. The chart is an
 * SVG drawn by the page from these numbers; nothing here touches the DOM.
 *
 * Dates are ISO days (`2026-11-15`) throughout and are compared as days, never as
 * local times, so the chart is the same in every time zone.
 */
import type { components } from "@console/lib/ops-types";

export type Roadmap = components["schemas"]["RoadmapOut"];
export type Item = components["schemas"]["ItemOut"];
export type Track = components["schemas"]["TrackOut"];
export type Milestone = components["schemas"]["RoadmapMilestoneOut"];
export type Status = Item["status"];

/** Every status, from finished to uncertain, in the order the legend shows them. */
export const STATUSES: Status[] = [
  "done",
  "in_progress",
  "review",
  "planned",
  "proposed",
];

const DAY = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `b - a` in whole days; negative when `b` is before `a`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY);
}

/** The day `n` days after `day` (`n` may be negative). */
export function addDays(day: string, n: number): string {
  return iso(utc(day) + n * DAY);
}

/** The Monday of the week `day` falls in. */
export function mondayOf(day: string): string {
  const weekday = (new Date(utc(day)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

/**
 * The days the chart covers: from the Monday before the first item or milestone to a
 * week past the last, so every bar has air on both sides. `today` is always inside.
 */
export function spanOf(
  roadmap: Pick<Roadmap, "items" | "milestones">,
  today: string
): { start: string; end: string } {
  const days = [
    today,
    ...roadmap.items.flatMap((i) => [i.start, i.end]),
    ...(roadmap.milestones ?? []).map((m) => m.date),
  ].sort();
  return {
    start: mondayOf(addDays(days[0], -3)),
    end: addDays(days[days.length - 1], 7),
  };
}

/** Every Monday from `start` to `end`, the first one included when `start` is a Monday. */
export function weekStarts(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = mondayOf(start); d <= end; d = addDays(d, 7)) {
    if (d >= start) out.push(d);
  }
  return out;
}

/** The first day of every month that begins inside `[start, end]`. */
export function monthStarts(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  for (;;) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    if (first > end) return out;
    out.push(first);
  }
}

/** Items by track, in the tracks' order, each track's items by start then end. */
export function rowsByTrack(
  roadmap: Pick<Roadmap, "tracks" | "items">
): { track: Track; items: Item[] }[] {
  return roadmap.tracks.map((track) => ({
    track,
    items: roadmap.items
      .filter((i) => i.track === track.id)
      .sort((a, b) =>
        a.start === b.start
          ? a.end.localeCompare(b.end)
          : a.start.localeCompare(b.start)
      ),
  }));
}

/** Whether an item that is not done has run past its end. */
export function isLate(item: Pick<Item, "status" | "end">, today: string) {
  return item.status !== "done" && item.end < today;
}

/** The items `item` depends on, by name, in the roadmap's order. */
export function dependencies(item: Item, roadmap: Pick<Roadmap, "items">) {
  const wanted = new Set(item.depends_on ?? []);
  return roadmap.items.filter((i) => wanted.has(i.id));
}

/** The next milestone not yet done on or after `today`, if any. */
export function nextMilestone(
  milestones: Milestone[],
  today: string
): Milestone | undefined {
  return milestones
    .filter((m) => m.status !== "done" && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}
