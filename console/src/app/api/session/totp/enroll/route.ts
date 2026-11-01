/** The second factor, first time: a new TOTP secret and its QR code, from bt-ops. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { opsCall, relay } from "@console/lib/session";
import { SESSION_COOKIE, errorBody, serverEnv } from "@console/lib/server";

export async function POST(): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(errorBody("signed_out", "sign in first"), {
      status: 401,
    });
  }
  return relay(
    await opsCall(serverEnv(), "POST", "/session/totp/enroll", token)
  );
}
