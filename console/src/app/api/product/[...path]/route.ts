/**
 * The BFF's path to the product API, for product actions (backend OPS-0002): accepting
 * an applicant, locking a protocol. They are the product's own audited `/admin/*` routes,
 * called with the person's product token, so `platform#admin` and `audit_log` apply as
 * in the product. No O1 app acts yet; Beta testers and Moderation (O2) will.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { forward } from "@console/lib/forward";
import { PRODUCT_COOKIE, errorBody, serverEnv } from "@console/lib/server";

/** The product paths a console app may call. */
export const PRODUCT_ALLOWED = ["admin"] as const;

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
  const token = (await cookies()).get(PRODUCT_COOKIE)?.value;
  return forward(request, (await ctx.params).path, {
    base: env.apiUrl,
    prefix: "",
    allowed: PRODUCT_ALLOWED,
    token,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
