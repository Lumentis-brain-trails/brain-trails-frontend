/**
 * The people an organisation records, and what they were given to run (backend V4
 * sprint T3, V4-0001, V4-0006).
 *
 * A clinic calls them patients, a laboratory participants: the same rows, the words
 * chosen by edition (`subjectWords`). A subject comes back from the API in one of two
 * shapes - `readable` for its carers (name, year of birth, consent), or a roster row for
 * an owner or admin who is not a carer (code, carers, counts, dates; every identifying
 * field null). The pages show what the row holds and never ask for more.
 *
 * Assignments pin a protocol version to a subject; the subject's own account sees them
 * in `/my` and nothing else of the application.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { Edition } from "@/lib/workspace";

export type Subject = components["schemas"]["SubjectOut"];
export type SubjectIn = components["schemas"]["SubjectIn"];
export type SubjectPatch = components["schemas"]["SubjectPatch"];
export type Carer = components["schemas"]["CarerOut"];
export type Assignment = components["schemas"]["AssignmentOut"];
export type AssignmentIn = components["schemas"]["AssignmentIn"];
export type MyAssignment = components["schemas"]["MyAssignment"];
export type MySession = components["schemas"]["MySession"];

/** The message namespace of an edition's words for the people it records. */
export type SubjectWords = "patients" | "participants";

/** A clinic records patients; a laboratory (and anything else) participants. */
export function subjectWords(edition: Edition): SubjectWords {
  return edition === "therapy" ? "patients" : "participants";
}

/**
 * How a subject is named on screen: the name when the caller may read it and one was
 * given, the code otherwise - a laboratory never has a name, a roster row never shows one.
 */
export function subjectLabel(
  subject: Pick<Subject, "code" | "display_name">
): string {
  return subject.display_name?.trim() || subject.code;
}

/**
 * Whether the subject may be recorded now: attested consent, not archived (the backend
 * answers 409 `consent_required` / `archived` otherwise; the picker says why first).
 */
export function recordable(
  subject: Pick<Subject, "consent_at" | "archived_at" | "readable">
): boolean {
  return (
    subject.readable &&
    subject.consent_at != null &&
    subject.archived_at == null
  );
}

/** "1 of 3", or just the count done when the allowance is open-ended. */
export function runsLeft(
  assignment: Pick<Assignment, "runs_allowed" | "runs_done">
): number | null {
  if (assignment.runs_allowed == null) return null;
  return Math.max(0, assignment.runs_allowed - assignment.runs_done);
}

/**
 * Whether a due date has passed, at `now`. A date-only due date (midday UTC, as the
 * assign dialog sends it) is late only a day after it, wherever the reader is.
 */
export function isLate(
  dueAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() + 24 * 3600_000 <= now.getTime();
}

/**
 * The ISO instant a date input's `YYYY-MM-DD` stands for: midday UTC of that day, so the
 * day reads the same in every timezone the clinic and the patient may be in. Empty or
 * malformed input is no due date.
 */
export function dueAtFromDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T12:00:00Z`;
}

export const SUBJECTS_QUERY_KEY = "subjects";

/** The subjects of an organisation the caller may know of (`view=mine`: their own). */
export function useSubjects(
  workspaceId: string | undefined,
  options: {
    view?: "mine" | "all";
    q?: string;
    archived?: boolean;
    enabled?: boolean;
  } = {}
) {
  const { view = "all", q = "", archived = false, enabled = true } = options;
  const params = new URLSearchParams({ view, limit: "200" }); // the API caps at 200
  if (q.trim()) params.set("q", q.trim());
  if (archived) params.set("archived", "true");
  return useQuery({
    queryKey: [SUBJECTS_QUERY_KEY, workspaceId, view, q.trim(), archived],
    queryFn: () =>
      api.get<Subject[]>(
        `workspaces/${workspaceId}/subjects?${params.toString()}`
      ),
    enabled: enabled && workspaceId !== undefined,
  });
}
