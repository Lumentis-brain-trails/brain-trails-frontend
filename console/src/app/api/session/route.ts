/**
 * Console sign-in and sign-out (see `@console/lib/session`).
 *
 * POST `{email, password}`: product login, then the exchange at bt-ops; answers
 * `{next: "enroll" | "verify"}` and sets the two httpOnly cookies.
 * DELETE: revokes the console session at bt-ops and clears both cookies.
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  clearCookies,
  opsCall,
  productLogin,
  relay,
  setPendingCookies,
} from "@console/lib/session";
import { SESSION_COOKIE, errorBody, serverEnv } from "@console/lib/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();
  if (!env.configured) {
    return NextResponse.json(
      errorBody("console_unavailable", "this console is not configured"),
      {
        status: 503,
      }
    );
  }
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // an unreadable body is the same as an empty one
  }
  if (!email || !password) {
    return NextResponse.json(
      errorBody("validation_error", "email and password are required"),
      {
        status: 422,
      }
    );
  }
  const login = await productLogin(env, email, password);
  if (login.status !== 200) return relay(login);
  const productToken = (login.body as { access_token: string }).access_token;
  const opened = await opsCall(env, "POST", "/session", undefined, {
    product_token: productToken,
  });
  if (opened.status !== 200) return relay(opened);
  const session = opened.body as { token: string; next: string };
  const response = NextResponse.json({ next: session.next });
  setPendingCookies(response, env, session.token, productToken);
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const env = serverEnv();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await opsCall(env, "DELETE", "/session", token);
  const response = new NextResponse(null, { status: 204 });
  clearCookies(response);
  return response;
}
