/**
 * BFF proxy (frontend ADR 0002): forwards allow-listed paths to the backend,
 * attaching the JWT from the httpOnly cookie. The browser never sees the token.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_DEPLOYED =
  (process.env.API_URL ?? "").length > 0 ||
  process.env.NODE_ENV !== "production";
const ALLOWED_PREFIXES = [
  "auth/",
  "recordings",
  "admin/",
  "sessions",
  "media",
  "protocols",
  "config",
  "workspaces",
];
/** Request headers the backend reads besides auth and content type. */
const FORWARDED_REQUEST_HEADERS = ["if-match"];
/** Response headers the browser needs besides content type (`x-next-cursor`: list paging). */
const FORWARDED_RESPONSE_HEADERS = ["etag", "x-next-cursor"];

async function forward(
  request: NextRequest,
  path: string[]
): Promise<NextResponse> {
  const joined = path.join("/");
  if (
    !ALLOWED_PREFIXES.some(
      (p) => joined === p.replace(/\/$/, "") || joined.startsWith(p)
    )
  ) {
    return NextResponse.json(
      { error: { code: "forbidden_path", message: "path not allowed" } },
      { status: 403 }
    );
  }
  const token = (await cookies()).get("bt_token")?.value;
  const url = new URL(`${API_URL}/${joined}`);
  request.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.set(key, value)
  );

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
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

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const responseBody = await upstream.arrayBuffer();
  const responseHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  };
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  // A null-body status must not carry one, not even an empty buffer: Response throws.
  const nullBody = upstream.status === 204 || upstream.status === 304;
  return new NextResponse(nullBody ? null : responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, (await ctx.params).path);
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, (await ctx.params).path);
}
