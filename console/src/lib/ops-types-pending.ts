/**
 * HAND-WRITTEN, TEMPORARY: the bt-ops contract of backend OPS-0005 (environments,
 * documents, access tokens) before the backend's `docs/api/ops-openapi.json` names it.
 *
 * Once the backend regenerates that file, run `npm run api:types`, point the aliases in
 * `client.ts` (and `EnvId` in `env.ts`) at `components["schemas"][...]` and delete this
 * module. Only those two import it; everything else takes the types from `client.ts`.
 */

/** An environment of the product whose database the console may read. */
export type EnvId = "dev" | "beta" | "prod";

/** `GET /ops/v1/envs`: where the console lives, and which environments it can read. */
export interface EnvsOut {
  home: EnvId;
  envs: { id: EnvId; available: boolean }[];
}

export type DocumentKind = "report" | "draft" | "brief" | "analysis" | "note";
export type DocumentStatus = "draft" | "final" | "archived";

/** A row of `GET /ops/v1/documents`. */
export interface DocumentItem {
  slug: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  audience: string;
  revision: number;
  updated_at: string;
  updated_by: string | null;
}

/** `GET /ops/v1/documents/{slug}`: the current revision with its body. */
export interface DocumentOut extends DocumentItem {
  body: string;
  created_at: string;
}

/** `POST /ops/v1/documents`; the slug is made from the title when left out. */
export interface DocumentIn {
  slug?: string;
  title: string;
  kind: DocumentKind;
  audience: string;
  body: string;
  note: string;
}

/** `PUT /ops/v1/documents/{slug}`: a save on the revision it was opened at. */
export interface DocumentUpdateIn {
  revision: number;
  title: string;
  body: string;
  note: string;
  kind?: DocumentKind;
  audience?: string;
}

/** `POST /ops/v1/documents/{slug}/status`. */
export interface DocumentStatusIn {
  revision: number;
  status: DocumentStatus;
}

/** A row of `GET /ops/v1/documents/{slug}/revisions`. */
export interface RevisionItem {
  revision: number;
  title: string;
  note: string;
  author: string | null;
  created_at: string;
}

/** `GET /ops/v1/documents/{slug}/revisions/{n}`. */
export interface RevisionOut extends RevisionItem {
  body: string;
}

/** A row of `GET /ops/v1/tokens`. */
export interface TokenOut {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** `POST /ops/v1/tokens`'s answer: the row and, this once, the token itself. */
export interface TokenCreatedOut extends TokenOut {
  token: string;
}

/** `POST /ops/v1/tokens`. */
export interface TokenIn {
  name: string;
  scopes: string[];
  expires_in_days: number;
}
