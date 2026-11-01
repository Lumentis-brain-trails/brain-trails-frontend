/**
 * The browser's client for the console: every call goes to the BFF (`/api/ops/...`),
 * which attaches the console session and the BFF key; the browser holds no token.
 *
 * Errors carry the backend's `{error: {code}}` code, so a screen can tell "signed out"
 * (back to `/login`) from "second factor still owed" (to `/login/verify`) from the rest.
 */
import type { components } from "./ops-types";

export type Schemas = components["schemas"];
export type Me = Schemas["MeOut"];
export type AppItem = Schemas["AppOut"];
export type AppDetail = Schemas["AppDetailOut"];
export type Version = Schemas["VersionOut"];
export type Pin = Schemas["PinOut"];
export type Snapshot = Schemas["SnapshotOut"];
export type WidgetItem = Schemas["WidgetOut"];
export type StripItem = Schemas["StripItemOut"];
export type StripItemIn = Schemas["StripItemIn"];

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api/ops/${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** A page of a list and the cursor of the next one (`X-Next-Cursor`). */
export interface Page<T> {
  items: T[];
  next: string | null;
}

export const ops = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  /** A list with its paging header. */
  async page<T>(path: string): Promise<Page<T>> {
    const res = await fetch(`/api/ops/${path}`);
    const items = await parse<T[]>(res);
    return { items, next: res.headers.get("x-next-cursor") };
  },
};

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
