/**
 * The browser half of the usage log (backend plan V4, sprint T0, decision V4-0007).
 *
 * Pages and features record what was used, never what was in it: an event is a
 * name from a closed list plus a few categories, such as the route **pattern**
 * (`/protocols/[id]/edit`, not the path with the id). Events wait in memory and
 * leave in one batch when the route changes or the page is hidden. Nothing runs
 * on a timer: an idle tab sends nothing, and the database is left to sleep
 * (backend decision 0014).
 *
 * The module is inert until a `UsageTracker` starts it, so a surface that does
 * not mount one - the participant's run, any future client shell - sends
 * nothing, even if a component on it calls `track()`.
 */
import type { components } from "@/lib/api-types";

/** One event as `POST /usage` takes it. */
export type UsageEvent = components["schemas"]["UsageEventIn"];

/** The events a browser may send; every other one the server writes at the act. */
export type UiEvent = "page.viewed" | "feature.used";

/** Categories describing an event: no ids, no free text, nothing nested. */
export type UsageProps = Record<string, string | number | boolean>;

/** The BFF path of `POST /usage`; the browser never calls the API directly. */
export const USAGE_ENDPOINT = "/api/backend/usage";

/** The backend's batch limit; a fuller buffer leaves at once instead of waiting. */
export const MAX_BATCH = 50;

/** The backend's longest category (`app.metrics.label`). */
const MAX_LABEL = 40;

/** The backend's most props per event (`app.usage.MAX_PROPS`). */
const MAX_PROPS = 8;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL = /[^@\s]+@[^@\s]+\.[^@\s]+/;

let buffer: UsageEvent[] = [];
let trackers = 0;

/**
 * Whether a key or string value would pass the backend's label guard: no UUID,
 * no email address, at most 40 characters. One value that fails gets the whole
 * batch refused (422 `usage_rejected`), so it is caught here, per event.
 */
export function isCategory(value: string): boolean {
  return value.length <= MAX_LABEL && !UUID.test(value) && !EMAIL.test(value);
}

/** Whether every key and value of `props` is a category the backend accepts. */
function cleanProps(props: UsageProps): boolean {
  const entries = Object.entries(props);
  return (
    entries.length <= MAX_PROPS &&
    entries.every(
      ([key, value]) =>
        isCategory(key) && (typeof value !== "string" || isCategory(value))
    )
  );
}

/**
 * The route pattern of `pathname`: each segment a dynamic param filled is put
 * back as its `[name]` (`[...name]` for a catch-all), so the event names the
 * page, not the protocol or recording on it.
 *
 * @param pathname - `usePathname()`: the URL path, without query or hash.
 * @param params - `useParams()`: the current route's dynamic params.
 */
export function routePattern(
  pathname: string,
  params: Record<string, string | string[] | undefined> | null
): string {
  const segments = pathname.split("/");
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      // a catch-all fills the tail; the pattern keeps one placeholder for it
      const tail = value.map(encodeURIComponent).join("/");
      const joined = segments.join("/");
      if (tail && joined.endsWith(`/${tail}`)) {
        const head = joined.slice(0, -tail.length - 1).split("/");
        segments.splice(0, segments.length, ...head, `[...${name}]`);
      }
      continue;
    }
    const encoded = encodeURIComponent(value);
    const index = segments.findIndex((s) => s === value || s === encoded);
    if (index > 0) segments[index] = `[${name}]`;
  }
  return segments.join("/") || "/";
}

/**
 * Whether a route is tracked at all. The participant's run (`.../run`) is not:
 * a session is timed to the millisecond and is the person's, not the product's
 * navigation; the server already records its start and end.
 */
export function isTrackedRoute(pattern: string): boolean {
  return !/\/run$/.test(pattern);
}

/**
 * Record one event. A no-op while no tracker is running, and for props that are
 * not categories (dropped with a warning outside production: a call site that
 * passes an id is a bug to fix, not data to keep).
 */
export function track(event: UiEvent, props: UsageProps = {}): void {
  if (trackers === 0) return;
  if (!cleanProps(props)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`usage: ${event} dropped, props are not categories`, props);
    }
    return;
  }
  buffer.push({ event, at: new Date().toISOString(), props });
  if (buffer.length >= MAX_BATCH) flush("navigate");
}

/**
 * Record that a feature was used: `name` is short and dotted, its area first
 * (`builder.publish`, `protocol.play`).
 */
export function trackFeature(name: string): void {
  track("feature.used", { feature: name });
}

/**
 * Send what is buffered, at most 50 events a request, and forget it whatever
 * the answer: a 429 or a 422 loses navigation counts, never an act, and there
 * is no retry because a retry needs a timer.
 *
 * @param reason - `"hide"` when the page may be going away (`sendBeacon`, which
 *   the browser delivers after unload); `"navigate"` otherwise (`fetch` with
 *   `keepalive`, which survives the route change).
 */
export function flush(reason: "navigate" | "hide"): void {
  if (buffer.length === 0) return;
  const pending = buffer;
  buffer = [];
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    send(JSON.stringify({ events: pending.slice(i, i + MAX_BATCH) }), reason);
  }
}

function send(body: string, reason: "navigate" | "hide"): void {
  if (reason === "hide" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(USAGE_ENDPOINT, blob)) return;
  }
  fetch(USAGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {
    // offline or the tab went away: the counts are lost, nothing else is
  });
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") flush("hide");
}

function onPageHide(): void {
  flush("hide");
}

/**
 * Start recording, for as long as the returned stop function is not called.
 * Called by `UsageTracker` only. Stopping flushes what is buffered, so nothing
 * recorded on a tracked page waits into an untracked one.
 */
export function startUsage(): () => void {
  trackers += 1;
  if (trackers === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    trackers -= 1;
    flush("navigate");
    if (trackers === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    }
  };
}

/** Drop the buffer and every tracker. For tests; a real reset is a page load. */
export function resetUsage(): void {
  buffer = [];
  trackers = 0;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pagehide", onPageHide);
}
