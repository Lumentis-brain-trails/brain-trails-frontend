/**
 * Statistics' payloads as the backend's panels write them
 * (`console/apps/statistics/` in the backend), and the pure rules the page draws them
 * with. A `null` number is a group hidden for being too small (fewer than `min_people`
 * people, shown to collaborators only), never a zero.
 */

export type Count = number | null;

export interface Definitions {
  min_people: number;
  test_email_patterns: string[];
  week_choices: number[];
  default_weeks: number;
  funnel_steps: string[];
  session_buckets: string[];
  idle_buckets: string[];
  retention_weeks: number;
}

export interface FunnelCounts {
  people: Count;
  verified: Count;
  accepted: Count;
  first_session: Count;
  second_session: Count;
}

export interface AcquisitionPayload {
  weeks: number;
  cohort: string | null;
  funnel: { step: string; people: Count }[];
  per_week: ({ week: string } & FunnelCounts)[];
  by_profile: ({ profile: string } & FunnelCounts)[];
  by_cohort: ({ cohort: string | null } & FunnelCounts)[];
  times: {
    step: string;
    people: Count;
    median: number | null;
    unit: "hours" | "days";
  }[];
}

export interface WeekRow {
  week: string;
  people: Count;
  sessions: Count;
}

export interface EngagementPayload {
  weeks: number;
  cohort: string | null;
  per_week: WeekRow[];
  per_month: { month: string; people: Count; sessions: Count }[];
  sessions_per_person: { bucket: string; people: Count }[];
  retention: {
    week: string;
    people: Count;
    retained: (number | null)[] | null;
  }[];
  days_since_last: { bucket: string; people: Count }[];
}

export interface ConsentPayload {
  weeks: number;
  cohort: string | null;
  people: Count;
  newsletter: { people: Count };
  versions: { version: string; people: Count }[];
  research: { version: string; people: Count }[];
  erasures: { month: string; erasures: number }[];
}

export interface WeeklyPayload {
  weeks: number;
  per_week: WeekRow[];
  last_week: WeekRow | null;
}

export interface SignupsPayload {
  days: number;
  people: Count;
  per_day: { day: string; people: Count }[];
}

/** A count as the page writes it: the number, or a dash for a hidden group. */
export function count(value: Count | undefined): string {
  return value === null || value === undefined ? "–" : String(value);
}

/** `part` as a share of `whole`, in whole percent; a dash when either is hidden or 0. */
export function percent(
  part: Count | undefined,
  whole: Count | undefined
): string {
  if (part == null || whole == null || whole === 0) return "–";
  return `${Math.round((part / whole) * 100)}%`;
}

/** A retention share (0-1) as whole percent, or a dash for a week not reached. */
export function share(value: number | null | undefined): string {
  return value == null ? "–" : `${Math.round(value * 100)}%`;
}

/** The funnel with each step's share of the first step and of the step before. */
export function funnelRows(
  funnel: AcquisitionPayload["funnel"]
): { step: string; people: Count; ofFirst: string; ofPrevious: string }[] {
  const first = funnel[0]?.people ?? null;
  return funnel.map((row, i) => ({
    step: row.step,
    people: row.people,
    ofFirst: i === 0 ? "" : percent(row.people, first),
    ofPrevious: i === 0 ? "" : percent(row.people, funnel[i - 1].people),
  }));
}

/** The largest visible number of a series, at least 1: a bar's 100%. */
export function maxOf(values: Count[]): number {
  return Math.max(1, ...values.filter((v): v is number => v !== null));
}

/** Numbers for a chart: a hidden value draws as nothing (0), never as a guess. */
export function series(values: Count[]): number[] {
  return values.map((v) => v ?? 0);
}

/** A median as the page writes it, with its unit's word chosen by the caller. */
export function median(value: number | null): string {
  if (value === null) return "–";
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

/** The reports "refresh all" runs, in order, one after the other. */
export const REPORTS = ["acquisition", "engagement", "consent"] as const;
export type Report = (typeof REPORTS)[number];
