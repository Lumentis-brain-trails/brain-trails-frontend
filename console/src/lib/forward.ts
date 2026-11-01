/**
 * The BFF's two paths out (backend OPS-0002): console state and reads go to `bt-ops`,
 * product actions to the product API. Both are an allow-list of path prefixes, a token
 * from an httpOnly cookie, and a faithful copy of the answer - status, body, and the few
 * headers the browser needs (paging, downloads).
 */
import { NextRequest, NextResponse } from "next/server";
import { errorBody } from "./server";

export interface Target {
  /** Base URL of the service. */
  base: string;
  /** Path prefix on the service, e.g. `/ops/v1`; empty for the product API. */
  prefix: string;
  /** First path segments the browser may reach through this proxy. */
  allowed: readonly string[];
  /**
   * Of those, the ones reached with GET only. Checked on the decoded segments, like the
   * allow-list, so `%70rotocols` is `protocols` here too.
   */
  readOnly?: readonly string[];
  /** The bearer token to attach, if any. */
  token?: string;
  /** Extra request headers (the BFF key for bt-ops). */
  headers?: Record<string, string>;
}

const FORWARDED_REQUEST_HEADERS = ["if-match"];
const FORWARDED_RESPONSE_HEADERS = [
  "etag",
  "x-next-cursor",
  "content-disposition",
];

/** What one path segment may be once decoded: the characters our routes use. */
const SEGMENT = /^[A-Za-z0-9._:@-]+$/;

function decoded(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The segments of `path` if it may be forwarded, else null.
 *
 * The first segment must be on the allow-list, and every segment must stay one plain
 * segment: an encoded slash or backslash (`%2F`, `%5C`), a backslash (which some
 * servers read as `/`), a dot segment, or anything outside the characters our routes use
 * is refused - checked after decoding, so `%2e%2e` is `..` too.
 */
export function allowedSegments(
  path: string[],
  allowed: readonly string[]
): string[] | null {
  if (path.length === 0) return null;
  const out: string[] = [];
  for (const raw of path) {
    if (/%2f|%5c/i.test(raw) || raw.includes("\\")) return null;
    const segment = decoded(raw);
    if (
      segment === null ||
      segment === "." ||
      segment === ".." ||
      !SEGMENT.test(segment)
    ) {
      return null;
    }
    out.push(segment);
  }
  return allowed.includes(out[0]) ? out : null;
}

/** Whether `path` (joined segments) falls under one of `allowed`. */
export function isAllowed(path: string, allowed: readonly string[]): boolean {
  return allowedSegments(path.split("/"), allowed) !== null;
}

/** Forward `request` to `target` at `path`, or refuse it with 403 `forbidden_path`. */
export async function forward(
  request: NextRequest,
  path: string[],
  target: Target
): Promise<NextResponse> {
  const segments = allowedSegments(path, target.allowed);
  if (segments === null) {
    return NextResponse.json(errorBody("forbidden_path", "path not allowed"), {
      status: 403,
    });
  }
  if (
    request.method !== "GET" &&
    (target.readOnly ?? []).includes(segments[0])
  ) {
    return NextResponse.json(
      errorBody("forbidden", "this proxy only reads this path"),
      { status: 403 }
    );
  }
  const url = new URL(
    `${target.base}${target.prefix}/${segments.map(encodeURIComponent).join("/")}`
  );
  request.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.append(key, value)
  );

  const headers: Record<string, string> = { ...target.headers };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      errorBody("upstream_unavailable", "the service did not answer"),
      {
        status: 503,
      }
    );
  }
  const responseHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  };
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  const nullBody = upstream.status === 204 || upstream.status === 304;
  return new NextResponse(nullBody ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}
