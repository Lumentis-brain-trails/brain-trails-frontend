/**
 * Moving an admin's own recordings between environments (backend `app.transfers`).
 *
 * The link travels in a URL fragment from the source's account page to the target's
 * `/account/import`. A fragment is never sent to a server, so the one-time token stays
 * out of every access log on the way.
 */

/** `GET /transfers/peers`: where this environment sends recordings, and takes them from. */
export interface TransferPeers {
  env: string;
  export_to: { env: string; web_url: string }[];
  import_from: string[];
}

/** `POST /transfers/exports`. */
export interface TransferExport {
  token: string;
  source: string;
  expires_at: string;
}

/** `POST /transfers/imports`: what the source held, and what is being copied now. */
export interface TransferImport {
  source: string;
  found: number;
  queued: number;
  already_here: number;
}

/** The import page on `webUrl` for a link made on `source`, the token in the fragment. */
export function importUrl(
  webUrl: string,
  source: string,
  token: string
): string {
  const base = webUrl.replace(/\/+$/, "");
  return `${base}/account/import?from=${encodeURIComponent(source)}#t=${encodeURIComponent(token)}`;
}

/** The token in a `#t=...` fragment, or "" when there is none. */
export function tokenFromHash(hash: string): string {
  const match = /(?:^#|&)t=([^&]+)/.exec(hash);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

/** The message key of an environment's name; anything unknown reads as "other". */
export function envKey(env: string): "dev" | "beta" | "prod" | "other" {
  return env === "dev" || env === "beta" || env === "prod" ? env : "other";
}
