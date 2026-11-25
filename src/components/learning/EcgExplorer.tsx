"use client";

/**
 * The heartbeat taken apart: eight bells, each a colour, each switched on and off, with
 * its three numbers (where, how wide, how tall). With every bell on, their sum is the
 * ECG; with one off, the class sees which bump of the trace that bell was.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, cn } from "@/components/ui";
import {
  LearningFigure,
  PART_COLOURS,
} from "@/components/learning/LearningFigure";
import { formatCode } from "@/lib/learning/questions";
import { ECG_BEAT, ECG_WAVES, type EcgWave, ecg } from "@/lib/learning/signals";

export function EcgExplorer() {
  const t = useTranslations("learning.ecg");
  const [on, setOn] = useState<Set<EcgWave>>(new Set(ECG_WAVES));
  const [parts, setParts] = useState(true);
  const keep = ECG_WAVES.filter((w) => on.has(w));
  const colours = keep.map((w) => PART_COLOURS[ECG_WAVES.indexOf(w)]);
  const toggle = (w: EcgWave) =>
    setOn((s) => {
      const next = new Set(s);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });

  return (
    <Card className="space-y-4">
      <div className="rounded-xl border border-hairline p-2">
        <LearningFigure
          className="mx-auto max-w-3xl"
          colours={colours}
          spec={{
            kind: "signal",
            parts: parts ? keep.map((w) => ecg(1, [w])) : [ecg(1, keep)],
            domain: [0, 3],
            yRange: [-0.4, 1.1],
            showParts: parts,
            ticks: true,
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ECG_WAVES.map((w, i) => {
          const b = ECG_BEAT[w];
          return (
            <button
              key={w}
              type="button"
              aria-pressed={on.has(w)}
              onClick={() => toggle(w)}
              className={cn(
                "pressable rounded-xl border px-3 py-2 text-left",
                on.has(w)
                  ? "border-hairline-strong"
                  : "border-hairline opacity-45"
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PART_COLOURS[i] }}
                />
                {w}
              </span>
              <span className="block font-mono text-[11px] text-ink-3 tabular-nums">
                {formatCode([
                  { name: "mu", value: b.mu },
                  { name: "sigma", value: b.sigma },
                  { name: "a", value: b.a },
                ])}
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input
          type="checkbox"
          checked={parts}
          onChange={(e) => setParts(e.target.checked)}
        />
        {t("showParts")}
      </label>
    </Card>
  );
}
