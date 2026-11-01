/**
 * The apps opened in this tab, for the side rail's "open" list (backend OPS-0003: "the
 * side rail lists open and pinned apps by name"). Per tab, in sessionStorage: closing
 * the tab closes them; nothing goes to the server but the `app_opens` row itself.
 */
export const OPEN_APPS_KEY = "bto-open-apps";
const MAX_OPEN = 8;

/** The slugs open in this tab, most recent first. */
export function readOpenApps(
  storage: Pick<Storage, "getItem"> | undefined
): string[] {
  try {
    const raw = storage?.getItem(OPEN_APPS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/** Put `slug` first in the list, keeping at most eight; returns the new list. */
export function rememberOpenApp(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  slug: string
): string[] {
  const next = [slug, ...readOpenApps(storage).filter((s) => s !== slug)].slice(
    0,
    MAX_OPEN
  );
  try {
    storage?.setItem(OPEN_APPS_KEY, JSON.stringify(next));
  } catch {
    // a private window without storage keeps the list for this render only
  }
  return next;
}

/** Take `slug` off the list; returns the new list. */
export function forgetOpenApp(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  slug: string
): string[] {
  const next = readOpenApps(storage).filter((s) => s !== slug);
  try {
    storage?.setItem(OPEN_APPS_KEY, JSON.stringify(next));
  } catch {
    // as above
  }
  return next;
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedList: string[] = [];
const EMPTY: string[] = [];

/** `useSyncExternalStore` subscription: told when this tab's list changes. */
export function subscribeOpenApps(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `useSyncExternalStore` snapshot: the same array until the stored list changes. */
export function openAppsSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(OPEN_APPS_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = readOpenApps(window.sessionStorage);
  }
  return cachedList;
}

/** The server renders no open apps. */
export function openAppsServerSnapshot(): string[] {
  return EMPTY;
}

/** `rememberOpenApp` on this tab's storage, then tell the subscribers. */
export function noteOpened(slug: string): void {
  rememberOpenApp(window.sessionStorage, slug);
  listeners.forEach((l) => l());
}
