/**
 * Whether this document has moved between routes inside the app, and so has a
 * history entry of its own that a back control can pop.
 *
 * `window.history.length` cannot answer this. It counts entries that are not
 * ours — the sites a tab visited before, and the blank page some browsers open a
 * tab on — so a control that trusts it pops out of the app, or onto
 * `about:blank`, for anyone who reached the page by a direct link.
 *
 * Module state does answer it: it starts at zero on every full document load,
 * which is exactly a visitor who arrived from outside, and only grows while the
 * App Router moves between routes in the same document.
 */
let depth = 0;

/** Record one in-app route change. Called by the root provider, never by a page. */
export function recordNavigation(): void {
  depth += 1;
}

/** True when going back would land on a page of this app. */
export function hasInAppHistory(): boolean {
  return depth > 0;
}

/** Forget the recorded navigations. For tests; a real reset is a page load. */
export function resetNavigationHistory(): void {
  depth = 0;
}
