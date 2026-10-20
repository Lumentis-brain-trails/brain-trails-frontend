/**
 * What the console's server side knows and the browser never does (backend OPS-0002).
 *
 * The BFF holds two tokens in httpOnly cookies - the person's product token and their
 * console session - and one secret, `OPS_BFF_KEY`, which it presents on every request to
 * `bt-ops`. Read per call, so a test can set the environment before importing nothing.
 */

/** The console session token issued by `bt-ops` (pending, then active for 12 h). */
export const SESSION_COOKIE = "bto_session";
/** The product token, for product actions through the product API (`/admin/*`). */
export const PRODUCT_COOKIE = "bto_product";

/** Seconds a console session lasts once the second factor is right (bt-ops: 12 h). */
export const SESSION_SECONDS = 12 * 60 * 60;
/** Seconds a sign-in may wait for its second factor (bt-ops: 10 min). */
export const PENDING_SECONDS = 10 * 60;
/** A little under the product's 120-minute JWT, as the product's own BFF does. */
export const PRODUCT_SECONDS = 115 * 60;

export interface ServerEnv {
  /** bt-ops of this environment, e.g. https://ops-dev.63.182.39.169.sslip.io */
  opsUrl: string;
  /** The key bt-ops answers to; empty in production means "not configured". */
  bffKey: string;
  /** The product API of the same environment. */
  apiUrl: string;
  /** Cookies are `Secure` unless COOKIE_SECURE=false (local http). */
  secureCookies: boolean;
  /** Whether both services are configured (a production build without them answers 503). */
  configured: boolean;
}

/** The environment as the BFF reads it, with the local defaults of `make ops-run`. */
export function serverEnv(): ServerEnv {
  const production = process.env.NODE_ENV === "production";
  const opsUrl = process.env.OPS_API_URL ?? "";
  const bffKey = process.env.OPS_BFF_KEY ?? "";
  const apiUrl = process.env.API_URL ?? "";
  return {
    opsUrl: opsUrl || "http://localhost:8100",
    bffKey: bffKey || (production ? "" : "local-ops-bff-key"),
    apiUrl: apiUrl || "http://localhost:8000",
    secureCookies: process.env.COOKIE_SECURE !== "false",
    configured:
      !production || (opsUrl !== "" && bffKey !== "" && apiUrl !== ""),
  };
}

/** The error body every BFF refusal uses: the backend's `{error: {code, message}}`. */
export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}
