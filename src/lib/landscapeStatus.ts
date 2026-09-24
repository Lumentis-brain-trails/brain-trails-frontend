/**
 * Whether the person's Brain Landscape was redrawn since they last saw it (backend V3-0017).
 *
 * The map grows session by session, keeping every place where it was; now and then
 * keeping them costs too much and it is redrawn - a new epoch, every place moved. The
 * sidebar marks the Brain Landscape entry until the person has looked at the new map.
 * It asks `GET /landscape/status` (one row, never the map) and compares the epoch with
 * the last one this browser showed.
 *
 * The "seen" epoch lives in this browser's storage, like the beta prompt's mark: seeing a
 * redraw once more on a second device costs less than a column for it. With nothing
 * stored, the first epoch counts as seen - the map's first drawing is not a change.
 */
import type { components } from "@/lib/api-types";

export type LandscapeStatus = components["schemas"]["BrainLandscapeStatusOut"];

/** localStorage key of the last epoch the landscape page showed. */
export const LANDSCAPE_SEEN_KEY = "bt-landscape-seen-epoch";
/** Dispatched on `window` when the seen epoch changes in this tab. */
const SEEN_EVENT = "bt-landscape-seen";

/** Whether `status` holds a map redrawn after the `seen` epoch (null: none stored). */
export function isRedrawn(
  status: LandscapeStatus | undefined,
  seen: number | null
): boolean {
  const epoch = status?.epoch;
  return epoch !== null && epoch !== undefined && epoch > (seen ?? 1);
}

/** The last epoch this browser showed, or null. */
export function readSeenEpoch(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LANDSCAPE_SEEN_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Remember that the map of `epoch` was shown; never moves the mark backwards. */
export function markEpochSeen(epoch: number): void {
  if ((readSeenEpoch() ?? 0) >= epoch) return;
  try {
    window.localStorage.setItem(LANDSCAPE_SEEN_KEY, String(epoch));
  } catch {
    // blocked storage: the mark stays until the next redraw is seen elsewhere
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** Subscribe to the seen epoch changing, in this tab or another. */
export function subscribeSeenEpoch(onChange: () => void): () => void {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
