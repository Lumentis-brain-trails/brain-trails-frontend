/**
 * The token of an invitation link, kept out of the address bar (backend T2/T3).
 *
 * `/join?token=...` is a credential: whoever holds it takes the seat or opens the
 * patient's account. Once the page has read it, the token moves to this tab's
 * `sessionStorage` and the URL becomes plain `/join`, so it stays out of the history, of
 * a bookmark, of a shared screen and of `/login?from=` - signing in brings the person
 * back to `/join`, which finds the token again here. It is forgotten once used.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

export const JOIN_TOKEN_KEY = "bt-join-token";

const noop = () => () => {};

function stored(): string | null {
  try {
    return window.sessionStorage.getItem(JOIN_TOKEN_KEY);
  } catch {
    return null; // storage blocked: only a link opened in this page load works
  }
}

/** Forget the token once its invitation was taken. */
export function forgetJoinToken(): void {
  try {
    window.sessionStorage.removeItem(JOIN_TOKEN_KEY);
  } catch {
    /* nothing kept */
  }
}

/**
 * The invitation token this page works with, and whether it is known yet (the stored one
 * is only readable in the browser). Moves a token from the URL into storage.
 */
export function useJoinToken(): { token: string; ready: boolean } {
  const fromUrl = useSearchParams().get("token");
  const kept = useSyncExternalStore(noop, stored, () => null);
  const inBrowser = useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
  useEffect(() => {
    if (!fromUrl) return;
    try {
      window.sessionStorage.setItem(JOIN_TOKEN_KEY, fromUrl);
    } catch {
      /* storage blocked: the token still works for this page load */
    }
    window.history.replaceState(window.history.state, "", "/join");
  }, [fromUrl]);
  return { token: fromUrl ?? kept ?? "", ready: fromUrl !== null || inBrowser };
}
