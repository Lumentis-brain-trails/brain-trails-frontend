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

/** Whether `path` (joined segments) falls under one of `allowed`. */
export function isAllowed(path: string, allowed: readonly string[]): boolean {
  const first = path.split("/")[0];
  return (
    allowed.includes(first) &&
    !path.split("/").some((s) => s === ".." || s === ".")
  );
}

/** Forward `request` to `target` at `path`, or refuse it with 403 `forbidden_path`. */
export async function forward(
  request: NextRequest,
  path: string[],
  target: Target
): Promise<NextResponse> {
  const joined = path.join("/");
  if (!isAllowed(joined, target.allowed)) {
    return NextResponse.json(errorBody("forbidden_path", "path not allowed"), {
      status: 403,
    });
  }
  const url = new URL(`${target.base}${target.prefix}/${joined}`);
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
