/**
 * Which relief a page's 3D landscape is drawn with, hills or wells, remembered per page.
 *
 * Each page names itself (`place`) and its default: wells where a person trains toward a
 * place of their map (the neurofeedback pages), hills elsewhere. The reader's choice is
 * kept in this browser (`localStorage`, key `bt-relief:<place>`), and in memory for the
 * tab too, so a browser that refuses storage (private mode, a blocked origin) still
 * keeps the choice until the page is closed. Storage is never required: every read and
 * write is guarded and falls back to the default.
 */

import { useCallback, useSyncExternalStore } from "react";
import { RELIEFS, type Relief } from "@/lib/brainLandscape";

const PREFIX = "bt-relief:";
const memory = new Map<string, Relief>();
const listeners = new Set<() => void>();

function isRelief(value: unknown): value is Relief {
  return RELIEFS.includes(value as Relief);
}

/** The relief chosen for `place` in this browser, or `fallback` when none was. */
export function readRelief(place: string, fallback: Relief): Relief {
  const held = memory.get(place);
  if (held) return held;
  try {
    const stored = window.localStorage.getItem(PREFIX + place);
    if (isRelief(stored)) return stored;
  } catch {
    // no storage here: the default
  }
  return fallback;
}

/** Remember `relief` for `place`, and tell every view of it. */
export function storeRelief(place: string, relief: Relief): void {
  memory.set(place, relief);
  try {
    window.localStorage.setItem(PREFIX + place, relief);
  } catch {
    // kept in memory for this tab
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `[relief, setRelief]` for a page's landscape. The server render and the first
 * client one use `fallback`, so hydration never disagrees; the stored choice follows.
 */
export function useRelief(
  place: string,
  fallback: Relief
): [Relief, (relief: Relief) => void] {
  const relief = useSyncExternalStore(
    subscribe,
    () => readRelief(place, fallback),
    () => fallback
  );
  const set = useCallback((next: Relief) => storeRelief(place, next), [place]);
  return [relief, set];
}

/** For tests: forget the tab's choices. */
export function resetReliefMemory(): void {
  memory.clear();
}
