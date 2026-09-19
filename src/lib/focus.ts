"use client";

import { useEffect } from "react";

/**
 * Focus mode: while `active`, the app chrome (sidebar, mobile top bar) steps aside
 * so a recording or a protocol run has the whole screen. It is a flag on <html>
 * (`data-focus`) that globals.css reads, so no layout component has to know which
 * page asked for it.
 *
 * Counted, not boolean: two components asking at once must both release it before
 * the chrome comes back.
 */
let holders = 0;

function apply() {
  if (holders > 0) document.documentElement.dataset.focus = "true";
  else delete document.documentElement.dataset.focus;
}

export function useFocusMode(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holders += 1;
    apply();
    return () => {
      holders -= 1;
      apply();
    };
  }, [active]);
}
