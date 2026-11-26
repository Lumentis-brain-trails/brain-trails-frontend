"use client";

/**
 * Decoding by hand: sliders hold the numbers, the figure draws what they decode to, over
 * the dashed original the person is trying to rebuild. The distance between the two is
 * shown as it changes; when it is small enough, the code is the original's.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Icon } from "@/components/ui";
import { LearningFigure } from "@/components/learning/LearningFigure";
import {
  type Playground as PlaygroundSpec,
  codeValues,
  playgroundParts,
} from "@/lib/learning/encoding";
import { type ParamName, PARAM_SYMBOL, round } from "@/lib/learning/questions";
import { rmsError } from "@/lib/learning/signals";

/** Below this distance the rebuilt signal counts as the original. */
const CLOSE_ENOUGH = 0.04;

export function Playground({ spec }: { spec: PlaygroundSpec }) {
  const t = useTranslations("learning.playground");
  const start = () =>
    Object.fromEntries(
      spec.sliders.map((s) => [s.name, s.min + (s.max - s.min) / 4])
    ) as Partial<Record<ParamName, number>>;
  const [values, setValues] = useState(start);
  const target = playgroundParts(spec.model, codeValues(spec.target));
  const mine = playgroundParts(spec.model, values);
  const error = rmsError(target, mine, spec.domain);
  const close = error < CLOSE_ENOUGH;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">{t("title")}</h3>
        <p className="mt-1 text-ink-2">{t("text")}</p>
      </div>
      <div className="rounded-xl border border-hairline p-2">
        <LearningFigure
          className="mx-auto max-w-2xl"
          spec={{
            kind: "signal",
            parts: mine,
            ghost: target,
            domain: spec.domain,
            yRange: spec.yRange,
            ticks: true,
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {spec.sliders.map((s) => (
          <label key={s.name} className="block">
            <span className="flex justify-between font-mono text-[14px] tabular-nums">
              <span>{PARAM_SYMBOL[s.name]}</span>
              <span>{round(values[s.name] ?? s.min)}</span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={values[s.name] ?? s.min}
              onChange={(e) =>
                setValues((v) => ({ ...v, [s.name]: Number(e.target.value) }))
              }
              className="w-full accent-[var(--accent)]"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="type-caption text-ink-3">
          {t("distance", { d: round(error) })}
        </span>
        {close && (
          <span className="inline-flex items-center gap-1.5 font-medium text-ok">
            <Icon name="check" /> {t("matched")}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setValues(start())}
        >
          {t("reset")}
        </Button>
      </div>
    </Card>
  );
}
