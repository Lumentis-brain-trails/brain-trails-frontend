"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";

/**
 * Modal sheet. A dimming scrim pushes the page back while the sheet
 * materialises (scale + fade on the shared motion tokens). Escape and a click
 * on the scrim close it; focus lands on the first focusable control.
 */
export function Sheet({
  title,
  onClose,
  children,
  className,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([data-close])"
    );
    first?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, dismissible]);

  return (
    <div
      className="enter-fade fixed inset-0 z-50 flex items-end justify-center bg-(--scrim) p-0 sm:items-center sm:p-6"
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={cn(
          "enter-pop w-full max-w-md rounded-t-[var(--radius-sheet)] bg-surface p-6 shadow-(--shadow-sheet) sm:rounded-[var(--radius-sheet)]",
          className
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="sheet-title" className="type-heading">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              data-close
              onClick={onClose}
              aria-label="Close"
              className="pressable -mt-1 -mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
