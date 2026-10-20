/** The second factor: a right code turns the session active and the cookie lives 12 h. */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { opsCall, relay, setActiveCookie } from "@console/lib/session";
import { SESSION_COOKIE, errorBody, serverEnv } from "@console/lib/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(errorBody("signed_out", "sign in first"), {
      status: 401,
    });
  }
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    // an unreadable body is a wrong code, which bt-ops counts
  }
  const verified = await opsCall(env, "POST", "/session/totp/verify", token, {
    code,
  });
  if (verified.status !== 200) return relay(verified);
  const response = NextResponse.json({ status: "ok" });
  setActiveCookie(response, env, token);
  return response;
}
