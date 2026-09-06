/**
 * BFF proxy (frontend ADR 0002): forwards allow-listed paths to the backend,
 * attaching the JWT from the httpOnly cookie. The browser never sees the token.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const ALLOWED_PREFIXES = ["auth/", "recordings", "admin/"];

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
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
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
