/** Login: exchanges credentials for a JWT and stores it in an httpOnly cookie. */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const SECURE = process.env.COOKIE_SECURE !== "false";

export async function POST(request: NextRequest) {
  if (
    !(process.env.API_URL ?? "").length &&
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json(
      {
        error: {
          code: "backend_unavailable",
          message:
            "The Brain Trails API is not deployed for this environment yet.",
        },
      },
      { status: 503 }
    );
  }
  const credentials = await request.json();
  const upstream = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const body = await upstream.json();
  if (!upstream.ok) {
    return NextResponse.json(body, { status: upstream.status });
  }
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("bt_token", body.access_token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 115, // slightly under the backend's 120 min JWT expiry
  });
  return response;
}
