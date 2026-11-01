/**
 * Cookie guard of the console: without a console session cookie, every page but the
 * sign-in sends the visitor to `/login`. bt-ops decides everything else (a pending
 * session, an expired one, a scope) on each request; this only spares a round trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@console/lib/server";

export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/")
    login.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/apps/:path*"],
};
