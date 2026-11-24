/**
 * The BFF's path to `bt-ops`: the console session from its cookie, the BFF key, and an
 * allow-list of what the shell and the apps read. Sign-in has its own routes
 * (`/api/session/*`), so `session` is not reachable here.
 *
 * Backend OPS-0005 adds two things: the environment a read is for (`X-Ops-Env`, passed
 * on when it is `dev`, `beta` or `prod`), and access tokens - a request with no session
 * cookie may bring `Authorization: Bearer btc_...`, on `documents` only, which is how a
 * working session writes a document without a browser.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { forward } from "@console/lib/forward";
import {
  CLIENT_IP_HEADER,
  SESSION_COOKIE,
  clientIp,
  errorBody,
  serverEnv,
} from "@console/lib/server";

/** The first path segment of every `/ops/v1` route the browser may reach. */
export const OPS_ALLOWED = [
  "me",
  "apps",
  "pins",
  "widgets",
  "snapshots",
  "worklog",
  "health",
  "stats",
  "roadmap",
  "envs",
  "documents",
  "tokens",
] as const;

/** Where an access token, instead of a session, may reach (OPS-0005). */
export const ACCESS_TOKEN_PATHS = ["documents"] as const;

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
  const client = clientIp(request.headers);
  return forward(request, (await ctx.params).path, {
    base: env.opsUrl,
    prefix: "/ops/v1",
    allowed: OPS_ALLOWED,
    token,
    forwardEnv: true,
    accessTokenPaths: ACCESS_TOKEN_PATHS,
    headers: {
      "X-Ops-Key": env.bffKey,
      ...(client ? { [CLIENT_IP_HEADER]: client } : {}),
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
