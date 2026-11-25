"use client";

/**
 * Nine pictures of one family, and the numbers that encode each one, hidden until the
 * class has guessed what they are. Revealing them all at once, or one picture at a
 * time with a tap, is the module's first move every time: look, guess the recipe, read
 * the code.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, cn } from "@/components/ui";
import { LearningFigure } from "@/components/learning/LearningFigure";
import { type Example, formatCode } from "@/lib/learning/questions";

export function Gallery({ examples }: { examples: Example[] }) {
  const t = useTranslations("learning.gallery");
  const [all, setAll] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-caption text-ink-3">{t("hint")}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setAll(!all);
            setShown(new Set());
          }}
        >
          {all ? t("hide") : t("show")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {examples.map((e) => {
          const open = all || shown.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.id)}
              aria-pressed={open}
              className={cn(
                "pressable flex flex-col gap-1 rounded-xl border bg-surface p-2 text-left",
                open ? "border-accent" : "border-hairline"
              )}
            >
              <LearningFigure spec={e.figure} />
              <span
                className={cn(
                  "text-center font-mono text-[13px] tabular-nums",
                  open ? "text-ink" : "text-ink-3"
                )}
              >
                {open ? formatCode(e.code) : t("hidden")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
