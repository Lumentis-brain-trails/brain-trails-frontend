"use client";

/**
 * Adding a row: every measure not on the page yet, grouped, each with what it is and how
 * to read it - so a reader chooses a measure by its meaning, not by its name.
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ROW_GROUPS, type RowId, type RowSpec } from "@/lib/compare/rows";

export function AddRowMenu({
  available,
  onAdd,
}: {
  available: readonly RowSpec[];
  onAdd: (id: RowId) => void;
}) {
  const tr = useTranslations("compare");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (box.current && !box.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (available.length === 0) return null;
  return (
    <div ref={box} className="relative mx-auto w-full max-w-md">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pressable w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-4 py-3 text-left font-medium"
      >
        {`+ ${tr("addRow")}`}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={tr("addRow")}
          className="absolute bottom-full left-0 z-20 mb-2 max-h-[60vh] w-full overflow-y-auto rounded-[var(--radius-card)] border border-hairline bg-surface p-2 shadow-(--shadow-sheet)"
        >
          {ROW_GROUPS.map((group) => {
            const options = available.filter((r) => r.group === group);
            if (options.length === 0) return null;
            return (
              <section key={group} className="py-1">
                <h4 className="type-caption px-2 py-1 font-semibold text-ink-3">
                  {tr(`groups.${group}`)}
                </h4>
                {options.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onAdd(r.id);
                      setOpen(false);
                    }}
                    className="pressable block w-full rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="block text-[14px] font-medium">
                      {tr(`rows.${r.id}.name`)}
                    </span>
                    <span className="type-caption block text-pretty text-ink-3">
                      {tr(`rows.${r.id}.meaning`)}
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
