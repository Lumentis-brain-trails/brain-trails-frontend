/**
 * The BFF's path to the product API, for product actions (backend OPS-0002): accepting
 * an applicant, locking a protocol. They are the product's own audited `/admin/*` routes,
 * called with the person's product token, so `platform#admin` and `audit_log` apply as
 * in the product. Beta testers and Moderation (O2) act through it; `config` tells them
 * which product flags are on.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { forward } from "@console/lib/forward";
import { PRODUCT_COOKIE, errorBody, serverEnv } from "@console/lib/server";

/** The product paths a console app may call. */
export const PRODUCT_ALLOWED = ["admin", "config", "protocols"] as const;

/**
 * Of those, the ones the console only reads: the catalog (Moderation's catalog locks
 * list the official protocols) and the flags. A write there is the product's own pages'
 * business, never the console's.
 */
export const PRODUCT_READ_ONLY = ["config", "protocols"] as const;

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
  const path = (await ctx.params).path;
  if (
    request.method !== "GET" &&
    (PRODUCT_READ_ONLY as readonly string[]).includes(path[0])
  ) {
    return NextResponse.json(
      errorBody("forbidden", "the console only reads this part of the product"),
      { status: 403 }
    );
  }
  const token = (await cookies()).get(PRODUCT_COOKIE)?.value;
  return forward(request, path, {
    base: env.apiUrl,
    prefix: "",
    allowed: PRODUCT_ALLOWED,
    token,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
