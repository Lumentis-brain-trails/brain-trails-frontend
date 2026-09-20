"use client";

import { useId, useState } from "react";

/** Local class join: `ui.tsx` imports this file, so it cannot import `cn` back. */
const cx = (...parts: (string | false)[]) => parts.filter(Boolean).join(" ");

/**
 * An info button: what a setting is for, one click or hover away instead of always on
 * screen. The text is in the DOM (hidden) so a screen reader gets it as the button's
 * description; clicking pins it open for touch, where there is no hover.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="group/info relative inline-flex">
      <button
        type="button"
        aria-label={label ? `About: ${label}` : "About this setting"}
        aria-describedby={id}
        aria-expanded={open}
        onClick={(event) => {
          // inside a <label>: a click must not land on the field it labels
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-hairline text-[10px] leading-none font-semibold text-ink-3 hover:border-ink-3 hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={cx(
          "absolute top-5 right-0 z-30 w-60 rounded-[var(--radius-control)] border border-hairline bg-surface p-2.5 text-[12px] leading-snug font-normal text-ink-2 shadow-lg",
          open ? "block" : "hidden group-hover/info:block"
        )}
      >
        {text}
      </span>
    </span>
  );
}
