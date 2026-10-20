/**
 * The work log's pure helpers: the API's shapes, the filter state as a query string,
 * the report's address, entries grouped by day, a detail split into prose and bullets.
 */
import type { components } from "@console/lib/ops-types";
import { query } from "@console/lib/client";

export type Entry = components["schemas"]["EntryOut"];
export type Facets = components["schemas"]["FacetsOut"];
export type Totals = components["schemas"]["TotalsOut"];
export type Grouping = Totals["by"];

/** What the person narrowed the log to; empty strings mean "any". */
export interface Filters {
  area: string;
  thread: string;
  status: "" | "done" | "in_progress";
  since: string;
  until: string;
}

export const NO_FILTERS: Filters = {
  area: "",
  thread: "",
  status: "",
  since: "",
  until: "",
};

/** The filters as the work log routes read them. */
export function filterQuery(
  f: Filters,
  extra: Record<string, string | number | null> = {}
): string {
  return query({ ...f, ...extra });
}

/** The BFF address of the report in `format`, for the same filters, in `lang`. */
export function reportHref(
  f: Filters,
  format: "md" | "pdf",
  lang: "en" | "it"
): string {
  return `/api/ops/worklog/report.${format}${filterQuery(f, { lang })}`;
}

/** Entries (newest first) grouped by day, keeping that order. */
export function byDay(
  entries: Entry[]
): { date: string; entries: Entry[]; tokens: number }[] {
  const days: { date: string; entries: Entry[]; tokens: number }[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) {
      last.entries.push(entry);
      last.tokens += entry.tokens_new;
    } else {
      days.push({
        date: entry.date,
        entries: [entry],
        tokens: entry.tokens_new,
      });
    }
  }
  return days;
}

/** A detail as the artifact wrote it: prose lines, and `- ` lines as bullets. */
export function splitDetail(detail: string): {
  prose: string;
  bullets: string[];
} {
  const lines = detail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    prose: lines.filter((l) => !l.startsWith("- ")).join(" "),
    bullets: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
  };
}

/** The payload of the `week` panel (backend `queries.week_summary`). */
export interface WeekPayload {
  week_start: string;
  week_end: string;
  entries: number;
  done: number;
  in_progress: number;
  days_worked: number;
  tokens_new: number;
  items: { date: string; title: string; areas: string[]; status: string }[];
}

/** The payload of the `tokens_week` panel (backend `queries.week_tokens`). */
export interface TokensWeekPayload {
  week_start: string;
  week_end: string;
  tokens_new: number;
  tokens_cache: number;
  per_day: { day: string; tokens_new: number }[];
}
