/** Cookie guard for authenticated areas; the backend enforces authorization anyway. */
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("bt_token");
  if (!hasSession) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/recordings/:path*", "/record", "/admin/:path*"],
};
