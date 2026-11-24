/**
 * The browser's client for the console: every call goes to the BFF (`/api/ops/...`),
 * which attaches the console session and the BFF key; the browser holds no token.
 *
 * Errors carry the backend's `{error: {code}}` code, so a screen can tell "signed out"
 * (back to `/login`) from "second factor still owed" (to `/login/verify`) from the rest.
 */
import { ENV_HEADER, type EnvId } from "./env";
import type { components } from "./ops-types";

export type Schemas = components["schemas"];
export type Me = Schemas["MeOut"];
export type AppItem = Schemas["AppOut"];
export type AppDetail = Schemas["AppDetailOut"];
export type Version = Schemas["VersionOut"];
export type Pin = Schemas["PinOut"];
/** A stored panel; `env` names the environment it was read from (OPS-0005). */
export type Snapshot = Schemas["SnapshotOut"];
export type WidgetItem = Schemas["WidgetOut"];
/** A widget on the strip; `key` is the full `<env>/<app>.<panel>`, never parsed here. */
export type StripItem = Schemas["StripItemOut"];
export type StripItemIn = Schemas["StripItemIn"];
// Backend OPS-0005: environments, documents, access tokens.
export type EnvsOut = Schemas["EnvsOut"];
export type DocumentKind = Schemas["DocumentKind"];
export type DocumentStatus = Schemas["DocumentStatus"];
/** A row of the document list. */
export type DocumentItem = Schemas["DocumentSummaryOut"];
/** A document at its current revision, with its body and that revision's note. */
export type DocumentOut = Schemas["DocumentOut"];
export type DocumentIn = Schemas["DocumentIn"];
/** A save, on the revision the editor was opened at. */
export type DocumentUpdateIn = Schemas["DocumentSave"];
export type DocumentStatusIn = Schemas["StatusIn"];
export type RevisionItem = Schemas["RevisionSummaryOut"];
export type RevisionOut = Schemas["RevisionOut"];
export type TokenOut = Schemas["TokenOut"];
/** A token just made: the row and, this once, the token itself. */
export type TokenCreatedOut = Schemas["TokenMadeOut"];
export type TokenIn = Schemas["TokenIn"];
/** What the Pipeline lab can run on one environment (backend OPS-0006). */
export type LabOptions = Schemas["LabOptionsOut"];
/** An experiment, as the form sends it and a run stores it. */
export type LabExperiment = Schemas["ExperimentIn"];
/** A row of the run list. */
export type LabRunItem = Schemas["LabRunSummaryOut"];
/** A run with its result, once it is done. */
export type LabRun = Schemas["LabRunOut"];
export type LabResult = Schemas["LabResultOut"];
export type LabRunStatus = Schemas["RunStatus"];
export type LabLabelSource = Schemas["LabelSource"];
export type LabMetric = Schemas["Metric"];

/** A refusal from the BFF or bt-ops, with the backend's error code. */
export class OpsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }

  /** The person has to sign in again. */
  get signedOut(): boolean {
    return (
      this.status === 401 &&
      this.code !== "second_factor" &&
      this.code !== "wrong_code"
    );
  }

  /** The sign-in still owes its second factor. */
  get needsSecondFactor(): boolean {
    return this.code === "second_factor";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = (
      body as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw new OpsRequestError(
      res.status,
      error?.code ?? "error",
      error?.message ?? res.statusText
    );
  }
  return body as T;
}

/** Query parameters with the empty ones left out. */
export function query(
  params: Record<string, string | number | null | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "")
      search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function headersFor(
  env: EnvId | null,
  json: boolean
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (env) headers[ENV_HEADER] = env;
  return Object.keys(headers).length ? headers : undefined;
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  env: EnvId | null
): Promise<T> {
  const res = await fetch(`/api/ops/${path}`, {
    method,
    headers: headersFor(env, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** A page of a list and the cursor of the next one (`X-Next-Cursor`). */
export interface Page<T> {
  items: T[];
  next: string | null;
}

/** The client's calls, as one value. */
export interface OpsClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
  /** A list with its paging header. */
  page: <T>(path: string) => Promise<Page<T>>;
}

/**
 * The client for reads of one product environment (`X-Ops-Env`, backend OPS-0005);
 * `null` sends no header, which bt-ops reads as the home environment. Only the apps that
 * follow the switch use it - the console's own data has no environment.
 */
export function opsIn(env: EnvId | null): OpsClient {
  return {
    get: <T>(path: string) => request<T>("GET", path, undefined, env),
    post: <T>(path: string, body: unknown = {}) =>
      request<T>("POST", path, body, env),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body, env),
    delete: <T>(path: string) => request<T>("DELETE", path, undefined, env),
    async page<T>(path: string): Promise<Page<T>> {
      const res = await fetch(`/api/ops/${path}`, {
        headers: headersFor(env, false),
      });
      const items = await parse<T[]>(res);
      return { items, next: res.headers.get("x-next-cursor") };
    },
  };
}

/** The client of the console's own data and of the home environment. */
export const ops: OpsClient = opsIn(null);

/** The sign-in steps, through the BFF's own routes. */
export const session = {
  open: (email: string, password: string) =>
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => parse<{ next: "enroll" | "verify" }>(r)),
  enroll: () =>
    fetch("/api/session/totp/enroll", { method: "POST" }).then((r) =>
      parse<Schemas["EnrollOut"]>(r)
    ),
  verify: (code: string) =>
    fetch("/api/session/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => parse<{ status: "ok" }>(r)),
  close: () =>
    fetch("/api/session", { method: "DELETE" }).then((r) => parse<void>(r)),
};
