/**
 * The BFF's path to `bt-ops`: the console session from its cookie, the BFF key, and an
 * allow-list of what the shell and the apps read. Sign-in has its own routes
 * (`/api/session/*`), so `session` is not reachable here.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { forward } from "@console/lib/forward";
import { SESSION_COOKIE, errorBody, serverEnv } from "@console/lib/server";

/** The first path segment of every `/ops/v1` route the browser may reach. */
export const OPS_ALLOWED = [
  "me",
  "apps",
  "pins",
  "widgets",
  "snapshots",
  "worklog",
] as const;

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const env = serverEnv();
  if (!env.configured) {
    return NextResponse.json(
      errorBody("console_unavailable", "this console is not configured"),
      {
        status: 503,
      }
    );
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return forward(request, (await ctx.params).path, {
    base: env.opsUrl,
    prefix: "/ops/v1",
    allowed: OPS_ALLOWED,
    token,
    headers: { "X-Ops-Key": env.bffKey },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
