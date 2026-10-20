/**
 * Server-side steps of the console sign-in (backend OPS-0002, "Sign-in").
 *
 * 1. the person's email and password go to the product API's `/auth/login`, as on the
 *    product's own sign-in page; the product token comes back;
 * 2. that token goes to `bt-ops` `POST /ops/v1/session`, which asks the product who it is,
 *    checks the person has console access and opens a pending session;
 * 3. the second factor (`/session/totp/enroll|verify`) turns it active for 12 hours.
 *
 * The browser only ever holds the two tokens as httpOnly cookies.
 */
import { NextResponse } from "next/server";
import {
  PENDING_SECONDS,
  PRODUCT_COOKIE,
  PRODUCT_SECONDS,
  SESSION_COOKIE,
  SESSION_SECONDS,
  type ServerEnv,
  errorBody,
} from "./server";

/** A JSON answer from upstream: status and parsed body (null when there was none). */
export interface Upstream {
  status: number;
  body: unknown;
}

async function call(url: string, init: RequestInit): Promise<Upstream> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } catch {
    return {
      status: 503,
      body: errorBody("upstream_unavailable", "the service did not answer"),
    };
  }
}

/** POST JSON to bt-ops with the BFF key and, when given, the console session. */
export function opsCall(
  env: ServerEnv,
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<Upstream> {
  const headers: Record<string, string> = {
    "X-Ops-Key": env.bffKey,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return call(`${env.opsUrl}/ops/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Sign in to the product with email and password; returns its answer as is. */
export function productLogin(
  env: ServerEnv,
  email: string,
  password: string
): Promise<Upstream> {
  return call(`${env.apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];

function cookie(env: ServerEnv, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

/** Store a pending console session and the product token on `response`. */
export function setPendingCookies(
  response: NextResponse,
  env: ServerEnv,
  sessionToken: string,
  productToken: string
): void {
  response.cookies.set(
    SESSION_COOKIE,
    sessionToken,
    cookie(env, PENDING_SECONDS)
  );
  response.cookies.set(
    PRODUCT_COOKIE,
    productToken,
    cookie(env, PRODUCT_SECONDS)
  );
}

/** The second factor passed: the same session token now lives 12 hours. */
export function setActiveCookie(
  response: NextResponse,
  env: ServerEnv,
  token: string
): void {
  response.cookies.set(SESSION_COOKIE, token, cookie(env, SESSION_SECONDS));
}

/** Forget both tokens. */
export function clearCookies(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(PRODUCT_COOKIE);
}

/** An upstream answer passed through to the browser. */
export function relay(upstream: Upstream): NextResponse {
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(upstream.body, { status: upstream.status });
}
