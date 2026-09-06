import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("bt_token", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
