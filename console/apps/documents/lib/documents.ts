/**
 * The rules of the Documents app (backend OPS-0005, "Documents") that the page checks
 * before it asks: the kinds and statuses, what a slug may be, how long a body may grow,
 * the list's query, and what an access token may be made with. bt-ops checks all of it
 * again; this only saves a round trip and words the refusal.
 */
import type { DocumentKind, DocumentStatus } from "@console/lib/client";

export const KINDS: readonly DocumentKind[] = [
  "report",
  "draft",
  "brief",
  "analysis",
  "note",
];

export const STATUSES: readonly DocumentStatus[] = [
  "draft",
  "final",
  "archived",
];

/** At most this many characters of Markdown in one revision (bt-ops: 200 000). */
export const MAX_BODY = 200_000;
export const MAX_TITLE = 200;
export const MAX_NOTE = 200;
export const MAX_AUDIENCE = 120;

/** A document's address: lowercase words joined by hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG = 80;

/** Whether `slug` may name a document. */
export function isSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG && SLUG.test(slug);
}

/**
 * A slug made from a title, as a suggestion the person may change: accents dropped,
 * anything else between words turned into one hyphen.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
}

/** The list's filters as the person set them; empty means "any". */
export interface ListFilters {
  kind: DocumentKind | "";
  status: DocumentStatus | "";
  q: string;
}

/** The path of the list for `filters`, the empty ones left out. */
export function listPath(filters: ListFilters): string {
  const search = new URLSearchParams();
  if (filters.kind) search.set("kind", filters.kind);
  if (filters.status) search.set("status", filters.status);
  const q = filters.q.trim();
  if (q) search.set("q", q);
  const text = search.toString();
  return text ? `documents?${text}` : "documents";
}

/** What the editor holds. */
export interface DocumentDraft {
  slug: string;
  title: string;
  kind: DocumentKind;
  audience: string;
  body: string;
  note: string;
}

export type DraftError =
  | "titleRequired"
  | "titleTooLong"
  | "slugInvalid"
  | "audienceRequired"
  | "audienceTooLong"
  | "bodyTooLong"
  | "noteRequired"
  | "noteTooLong";

export type DraftErrors = Partial<Record<keyof DocumentDraft, DraftError>>;

/**
 * What stops a save, by field; empty when the draft may go. A new document's slug may
 * be left empty (bt-ops makes one from the title); an existing one keeps its slug.
 * Every save carries a one-line note, as a commit does: the history is read by it.
 */
export function checkDraft(
  draft: DocumentDraft,
  creating: boolean
): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "titleRequired";
  else if (title.length > MAX_TITLE) errors.title = "titleTooLong";
  if (creating && draft.slug && !isSlug(draft.slug))
    errors.slug = "slugInvalid";
  const audience = draft.audience.trim();
  if (!audience) errors.audience = "audienceRequired";
  else if (audience.length > MAX_AUDIENCE) errors.audience = "audienceTooLong";
  if (draft.body.length > MAX_BODY) errors.body = "bodyTooLong";
  const note = draft.note.trim();
  if (!note) errors.note = "noteRequired";
  else if (note.length > MAX_NOTE) errors.note = "noteTooLong";
  return errors;
}

/** The statuses a document may move to from `status`: every other one. */
export function nextStatuses(status: DocumentStatus): DocumentStatus[] {
  return STATUSES.filter((s) => s !== status);
}

/** The scopes an access token may carry: documents only (OPS-0005, "Claude's door"). */
export const TOKEN_SCOPES = ["documents:read", "documents:write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** The message key of a scope: `documents:read` is `read`. */
export function scopeKey(scope: TokenScope): "read" | "write" {
  return scope === "documents:read" ? "read" : "write";
}

/** A token lives at most 90 days; these are the choices offered. */
export const MAX_TOKEN_DAYS = 90;
export const TOKEN_DAYS = [7, 30, 90] as const;

export interface TokenDraft {
  name: string;
  scopes: TokenScope[];
  days: number;
}

export type TokenError = "nameRequired" | "nameTooLong" | "scopesRequired";

/** What stops a token from being made, if anything. */
export function checkToken(
  draft: TokenDraft
): Partial<Record<"name" | "scopes", TokenError>> {
  const errors: Partial<Record<"name" | "scopes", TokenError>> = {};
  const name = draft.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > 80) errors.name = "nameTooLong";
  if (draft.scopes.length === 0) errors.scopes = "scopesRequired";
  return errors;
}

/** The body of `POST tokens` for `draft`: scopes in a fixed order, days within 1..90. */
export function tokenRequest(draft: TokenDraft): {
  name: string;
  scopes: TokenScope[];
  expires_in_days: number;
} {
  return {
    name: draft.name.trim(),
    scopes: TOKEN_SCOPES.filter((s) => draft.scopes.includes(s)),
    expires_in_days: Math.min(
      MAX_TOKEN_DAYS,
      Math.max(1, Math.round(draft.days))
    ),
  };
}

/** Whether a token still opens the door at `now`. */
export function tokenActive(
  token: { revoked_at: string | null; expires_at: string },
  now: Date
): boolean {
  return token.revoked_at === null && new Date(token.expires_at) > now;
}
