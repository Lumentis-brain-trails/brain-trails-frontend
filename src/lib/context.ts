/**
 * Context variables: the short questionnaire before every recording (backend
 * `app/context.py`, flag `context_questionnaire`).
 *
 * The backend owns the list: the defaults (emotions, focus, sleep, fatigue, stress and
 * time-bounded confounders, each option with its emoji) merged with what the account
 * personalised. A built-in item or option has no label in the API; its words are
 * message keys here (`context.items.<key>...`), so stored answers stay canonical in
 * every language. Items a person wrote carry their own text.
 *
 * The answers go to `PUT /sessions/{id}/context` right after Start, with the person's
 * wall clock and its offset: time of day is a covariate of its own. An answer the person
 * never touched is absent; a multi-choice item they opened and cleared is `[]`.
 *
 * The response types are written by hand until `api-types.ts` is next regenerated:
 * several open pull requests regenerate it, and a second copy would only conflict.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppConfig } from "@/lib/features";

export type ContextKind = "multi" | "single" | "scale" | "number";

/** One answer of a choice item, or one point ("1".."5") of a scale. */
export interface ContextOption {
  key: string;
  emoji: string;
  /** Null for a built-in option: its words are `context.items.<item>.options.<key>`. */
  label: string | null;
  custom: boolean;
  archived: boolean;
}

/** One question, as `GET /context-variables` returns it. */
export interface ContextItem {
  key: string;
  kind: ContextKind;
  label: string | null;
  emoji: string | null;
  custom: boolean;
  /** A built-in item the person turned off. */
  hidden: boolean;
  /** An item of their own they removed: kept to read old answers. */
  archived: boolean;
  options: ContextOption[];
  low_label: string | null;
  high_label: string | null;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
}

export interface ContextVariables {
  items: ContextItem[];
}

export type ContextValue = string[] | string | number;
export type ContextAnswers = Record<string, ContextValue>;

/** What `PUT /sessions/{id}/context` takes. */
export interface SessionContextIn {
  skipped: boolean;
  answers: ContextAnswers;
  local_time: string;
  utc_offset_min: number;
}

/** An option of the person's own, as `PUT /context-variables` takes it. */
export interface CustomOptionIn {
  key: string;
  label: string;
  emoji: string;
  archived?: boolean;
}

/** An item of the person's own, as `PUT /context-variables` takes it. */
export interface CustomItemIn {
  key: string;
  kind: Exclude<ContextKind, "number">;
  label: string;
  emoji: string;
  options: CustomOptionIn[];
  low_label: string | null;
  high_label: string | null;
  archived?: boolean;
}

/** The whole personalisation; anything left out is archived by the server. */
export interface ContextVariablesIn {
  hidden: string[];
  extra_options: Record<string, CustomOptionIn[]>;
  custom: CustomItemIn[];
}

export const CONTEXT_QUERY_KEY = ["context-variables"] as const;

/**
 * Whether this environment asks the questionnaire. Read from the raw flags because the
 * generated `FeatureName` does not list the flag yet; `false` while loading.
 */
export function useContextEnabled(): boolean {
  const config = useAppConfig();
  const features = config.data?.features as Record<string, boolean> | undefined;
  return features?.context_questionnaire === true;
}

/** The caller's list (defaults + personalisation); only fetched when enabled. */
export function useContextVariables(enabled = true) {
  return useQuery({
    queryKey: CONTEXT_QUERY_KEY,
    queryFn: () => api.get<ContextVariables>("context-variables"),
    enabled,
    staleTime: 60_000,
  });
}

/** The items the questionnaire asks, each with only its live options. */
export function askedItems(items: readonly ContextItem[]): ContextItem[] {
  return items
    .filter((item) => !item.hidden && !item.archived)
    .map((item) => ({
      ...item,
      options: item.options.filter((o) => !o.archived),
    }));
}

/**
 * Toggle `option` in a multi-choice answer, keeping the order the options are shown in,
 * so the same choice is always stored the same way.
 */
export function toggleOption(
  item: ContextItem,
  current: ContextValue | undefined,
  option: string
): string[] {
  const chosen = new Set(Array.isArray(current) ? current : []);
  if (chosen.has(option)) chosen.delete(option);
  else chosen.add(option);
  return item.options.map((o) => o.key).filter((key) => chosen.has(key));
}

/** A number typed by the person, or undefined when it is empty or outside the item's range. */
export function parseNumber(
  item: ContextItem,
  raw: string
): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  if (item.minimum !== null && value < item.minimum) return undefined;
  if (item.maximum !== null && value > item.maximum) return undefined;
  return value;
}

/**
 * The local wall clock as ISO 8601 with its offset ("2026-11-13T21:10:00+01:00") and the
 * offset in minutes east of UTC. `Date.toISOString` would give UTC and lose the hour of
 * the person's day, which is the point.
 */
export function localTime(now: Date = new Date()): {
  local_time: string;
  utc_offset_min: number;
} {
  const offset = -now.getTimezoneOffset();
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const sign = offset >= 0 ? "+" : "-";
  const local_time =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
  return { local_time, utc_offset_min: offset };
}

/** The body for one run: the answers, or a skip, stamped with the local time. */
export function sessionContext(
  answers: ContextAnswers | null,
  now: Date = new Date()
): SessionContextIn {
  return {
    skipped: answers === null,
    answers: answers ?? {},
    ...localTime(now),
  };
}

/** Store a run's answers; the run never waits on it failing. */
export function saveSessionContext(
  sessionId: string,
  body: SessionContextIn
): Promise<unknown> {
  return api.put(`sessions/${sessionId}/context`, body);
}

const EMOJI_LEAD =
  /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

/** Split "☕ Second coffee" into its emoji and its label; no emoji leaves `emoji` empty. */
export function splitEmoji(line: string): { emoji: string; label: string } {
  const trimmed = line.trim();
  const match = EMOJI_LEAD.exec(trimmed);
  if (!match) return { emoji: "", label: trimmed };
  return { emoji: match[1], label: trimmed.slice(match[0].length).trim() };
}

/**
 * A `c_` key for a new label, unique among `taken`: the backend's pattern
 * (`^c_[a-z0-9_]{1,40}$`), from the label's letters when it has any.
 */
export function customKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "item";
  let key = `c_${slug}`;
  for (let n = 2; used.has(key); n += 1) key = `c_${slug}_${n}`;
  return key;
}

/**
 * The personalisation an effective list describes, ready to PUT back: hidden built-ins,
 * the person's live options on built-in items, and their live items. Archived ones are
 * left out; the server keeps them archived.
 */
export function settingsFrom(
  items: readonly ContextItem[]
): ContextVariablesIn {
  const hidden: string[] = [];
  const extra_options: Record<string, CustomOptionIn[]> = {};
  const custom: CustomItemIn[] = [];
  const asIn = (o: ContextOption): CustomOptionIn => ({
    key: o.key,
    label: o.label ?? "",
    emoji: o.emoji,
  });
  for (const item of items) {
    if (!item.custom) {
      if (item.hidden) hidden.push(item.key);
      const mine = item.options.filter((o) => o.custom && !o.archived);
      if (mine.length) extra_options[item.key] = mine.map(asIn);
      continue;
    }
    if (item.archived || item.kind === "number") continue;
    custom.push({
      key: item.key,
      kind: item.kind,
      label: item.label ?? "",
      emoji: item.emoji ?? "",
      options:
        item.kind === "scale"
          ? []
          : item.options.filter((o) => !o.archived).map(asIn),
      low_label: item.low_label,
      high_label: item.high_label,
    });
  }
  return { hidden, extra_options, custom };
}
