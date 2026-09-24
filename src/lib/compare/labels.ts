/**
 * Trial labels on the trail: which colour and which marker each one gets.
 *
 * The backend labels every window of a task block by the trial whose target onset is
 * nearest the window's centre (backend V3-0012): `cargo_pressed`, `cargo_held`,
 * `debris_pressed`, `debris_held` for the go/no-go, `<condition>_right|wrong|missed` for
 * the choice tasks. A label is read as two parts, and each part has its own channel:
 *
 * - **colour is what was on screen** (the part before the last underscore): cargo,
 *   debris, a match, a lure;
 * - **the marker is what the person did** (the part after it): a filled dot for a press
 *   or a right answer, a ring for holding back or missing, a diamond for a wrong key.
 *
 * Why not four colours for the four go/no-go labels: a trail spreads its windows over
 * the plane, so every colour can end up next to every other, and no four hues keep
 * apart for colour-blind readers under that condition (the dataviz validator fails
 * every four-hue set in one mode or the other). Two or three hues plus two shapes do.
 * Past `MAX_GROUPS` things-on-screen, the rest fold into one neutral "other".
 */

export type LabelAct = "pressed" | "held" | "right" | "wrong" | "missed";

export type Marker = "dot" | "ring" | "diamond";

export interface ParsedLabel {
  /** What was on screen: `cargo`, `debris`, `match`, ... */
  group: string;
  /** What the person did, or null for a label outside the vocabulary. */
  act: LabelAct | null;
}

/** Hues a trail can carry and still be told apart by everyone (validated all-pairs). */
export const MAX_GROUPS = 3;

/** Groups that always take the same slot, so cargo is the same blue on every page. */
const KNOWN_GROUPS = ["cargo", "debris"];

const ACTS: readonly LabelAct[] = [
  "pressed",
  "right",
  "held",
  "missed",
  "wrong",
];

/** Split `cargo_pressed` into what was shown and what was done. */
export function parseLabel(label: string): ParsedLabel {
  const cut = label.lastIndexOf("_");
  const tail = cut > 0 ? label.slice(cut + 1) : "";
  if ((ACTS as readonly string[]).includes(tail))
    return { group: label.slice(0, cut), act: tail as LabelAct };
  return { group: label, act: null };
}

/** The marker of an act: the channel that carries what the person did. */
export function markerOf(act: LabelAct | null): Marker {
  if (act === "held" || act === "missed") return "ring";
  if (act === "wrong") return "diamond";
  return "dot";
}

/**
 * The groups of a recording, in slot order: known ones first, then the rest in the
 * order they first appear. Computed over every block of the recording, not per block,
 * so a group keeps its colour when the other column changes block.
 */
export function labelGroups(
  lists: readonly (readonly (string | null)[] | null | undefined)[]
): string[] {
  const seen: string[] = [];
  for (const list of lists)
    for (const label of list ?? [])
      if (label !== null) {
        const { group } = parseLabel(label);
        if (!seen.includes(group)) seen.push(group);
      }
  const known = KNOWN_GROUPS.filter((g) => seen.includes(g));
  const rest = seen.filter((g) => !KNOWN_GROUPS.includes(g));
  return [...known, ...rest].slice(0, MAX_GROUPS);
}

/** A group's colour slot, or null when it folded into "other". */
export function groupSlot(
  groups: readonly string[],
  group: string
): number | null {
  const slot = groups.indexOf(group);
  return slot >= 0 ? slot : null;
}

export interface LegendEntry {
  label: string;
  group: string;
  act: LabelAct | null;
  count: number;
}

/**
 * The legend of one block: each label with how many windows carry it, grouped by what
 * was on screen in slot order, then by act. Unlabelled windows are not an entry.
 */
export function legend(
  labels: readonly (string | null)[],
  groups: readonly string[]
): LegendEntry[] {
  const counts = new Map<string, number>();
  for (const label of labels)
    if (label !== null) counts.set(label, (counts.get(label) ?? 0) + 1);
  const rank = (group: string) => {
    const slot = groups.indexOf(group);
    return slot >= 0 ? slot : groups.length;
  };
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, ...parseLabel(label) }))
    .sort(
      (a, b) =>
        rank(a.group) - rank(b.group) ||
        a.group.localeCompare(b.group) ||
        ACTS.indexOf(a.act ?? "pressed") - ACTS.indexOf(b.act ?? "pressed")
    );
}
