/**
 * The roadmap editor's pure half: an item or a milestone as the form holds it (every
 * field a string, the lists as lines), back to the API's shape, and the checks the
 * form runs before it sends. The backend checks again, against the whole map; these
 * are the ones a person can fix without a round trip.
 *
 * Lines: a task is `day | text`, a link is `label | url`, a question is the line itself.
 * Empty lines are dropped, so a list is cleared by emptying its box.
 */
import type { Item, Milestone, Roadmap, Status } from "./gantt";
import { addDays } from "./gantt";

export type ItemDraft = {
  id: string;
  track: string;
  label: string;
  name: string;
  start: string;
  end: string;
  status: Status;
  tentative: boolean;
  size: string;
  depends_on: string[];
  note: string;
  tasks: string;
  questions: string;
  links: string;
};

export type MilestoneDraft = {
  id: string;
  track: string;
  date: string;
  name: string;
  status: Status;
};

/** What a field can be wrong with; the form words each in the reader's language. */
export type DraftError =
  | "required"
  | "badId"
  | "idTaken"
  | "badDate"
  | "endBeforeStart"
  | "badLine"
  | "badUrl";

export type DraftErrors<T> = Partial<Record<keyof T, DraftError>>;

const ID = /^[a-z][a-z0-9-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An id from a label: `O3b` -> `o3b`, `Hardening & release` -> `hardening-release`. */
export function slugOf(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `i-${slug}`.slice(0, 40);
}

/** The id `base` or, when taken, `base-2`, `base-3`... */
export function freeId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`.slice(0, 40);
    if (!used.has(id)) return id;
  }
}

/** The form's copy of an item. */
export function itemDraft(item: Item): ItemDraft {
  return {
    id: item.id,
    track: item.track,
    label: item.label,
    name: item.name,
    start: item.start,
    end: item.end,
    status: item.status,
    tentative: item.tentative ?? false,
    size: item.size ?? "",
    depends_on: [...(item.depends_on ?? [])],
    note: item.note ?? "",
    tasks: (item.tasks ?? []).map((t) => `${t.day} | ${t.text}`).join("\n"),
    questions: (item.questions ?? []).join("\n"),
    links: (item.links ?? []).map((l) => `${l.label} | ${l.url}`).join("\n"),
  };
}

/** A new item's form: the first track, a week from today, planned. */
export function newItemDraft(roadmap: Roadmap, today: string): ItemDraft {
  return {
    id: "",
    track: roadmap.tracks[0]?.id ?? "",
    label: "",
    name: "",
    start: today,
    end: addDays(today, 6),
    status: "planned",
    tentative: false,
    size: "",
    depends_on: [],
    note: "",
    tasks: "",
    questions: "",
    links: "",
  };
}

export function milestoneDraft(m: Milestone): MilestoneDraft {
  return {
    id: m.id,
    track: m.track,
    date: m.date,
    name: m.name,
    status: m.status,
  };
}

export function newMilestoneDraft(
  roadmap: Roadmap,
  today: string
): MilestoneDraft {
  return {
    id: "",
    track: roadmap.tracks[0]?.id ?? "",
    date: today,
    name: "",
    status: "planned",
  };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** `a | b` as `[a, b]`, split on the first bar; null when either side is empty. */
function pair(line: string): [string, string] | null {
  const at = line.indexOf("|");
  if (at < 0) return null;
  const a = line.slice(0, at).trim();
  const b = line.slice(at + 1).trim();
  return a && b ? [a, b] : null;
}

function validDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/**
 * What is wrong with an item's form, by field; empty when it can be sent. `isNew`
 * checks the id too (an existing item keeps its own).
 */
export function checkItem(
  draft: ItemDraft,
  roadmap: Roadmap,
  isNew: boolean
): DraftErrors<ItemDraft> {
  const errors: DraftErrors<ItemDraft> = {};
  if (isNew) {
    if (!draft.id) errors.id = "required";
    else if (!ID.test(draft.id) || draft.id.length > 40) errors.id = "badId";
    else if (roadmap.items.some((i) => i.id === draft.id))
      errors.id = "idTaken";
  }
  if (!draft.label.trim()) errors.label = "required";
  if (!draft.name.trim()) errors.name = "required";
  if (!draft.track) errors.track = "required";
  if (!validDay(draft.start)) errors.start = "badDate";
  if (!validDay(draft.end)) errors.end = "badDate";
  else if (validDay(draft.start) && draft.end < draft.start)
    errors.end = "endBeforeStart";
  if (lines(draft.tasks).some((l) => pair(l) === null))
    errors.tasks = "badLine";
  const links = lines(draft.links).map(pair);
  if (links.some((l) => l === null)) errors.links = "badLine";
  else if (links.some((l) => l && !/^https?:\/\//.test(l[1])))
    errors.links = "badUrl";
  return errors;
}

export function checkMilestone(
  draft: MilestoneDraft,
  roadmap: Roadmap,
  isNew: boolean
): DraftErrors<MilestoneDraft> {
  const errors: DraftErrors<MilestoneDraft> = {};
  if (isNew) {
    if (!draft.id) errors.id = "required";
    else if (!ID.test(draft.id) || draft.id.length > 40) errors.id = "badId";
    else if ((roadmap.milestones ?? []).some((m) => m.id === draft.id))
      errors.id = "idTaken";
  }
  if (!draft.name.trim()) errors.name = "required";
  if (!draft.track) errors.track = "required";
  if (!validDay(draft.date)) errors.date = "badDate";
  return errors;
}

/** The item the API takes from a checked form. */
export function itemOf(draft: ItemDraft): Item {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  return {
    id: draft.id,
    track: draft.track,
    label: draft.label.trim(),
    name: draft.name.trim(),
    start: draft.start,
    end: draft.end,
    status: draft.status,
    tentative: draft.tentative,
    size: opt(draft.size),
    depends_on: draft.depends_on.filter((d) => d !== draft.id),
    note: opt(draft.note),
    tasks: lines(draft.tasks).flatMap((l) => {
      const p = pair(l);
      return p ? [{ day: p[0], text: p[1] }] : [];
    }),
    questions: lines(draft.questions),
    links: lines(draft.links).flatMap((l) => {
      const p = pair(l);
      return p ? [{ label: p[0], url: p[1] }] : [];
    }),
  };
}

export function milestoneOf(draft: MilestoneDraft): Milestone {
  return {
    id: draft.id,
    track: draft.track,
    date: draft.date,
    name: draft.name.trim(),
    status: draft.status,
  };
}
