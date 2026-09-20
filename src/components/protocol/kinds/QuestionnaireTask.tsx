"use client";

/**
 * Self-report: SAM, visual analogue scales, NASA-TLX, or a custom list of items.
 *
 * Every item emits one `questionnaire_answer` marker when the form is submitted
 * (backend decision V3-0004, "Events"), so an answer sits on the same timeline as the
 * EEG it describes; the answers are also returned in the step summary. Submitting needs
 * every item answered - a slider counts once it has been moved - because a default
 * value left untouched is indistinguishable from a real answer of the same value.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button, cn } from "@/components/ui";
import {
  NASA_TLX_SCALES,
  type QuestionnaireConfig,
  SAM_DIMENSIONS,
  questionnaireConfigSchema,
} from "@/lib/protocol/blocks";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { type SamDimension, SamManikin } from "./SamManikin";
import { useFinish } from "./shared";

type Item =
  | { id: string; type: "sam"; dimension: SamDimension }
  | {
      id: string;
      type: "slider";
      text: string;
      min: number;
      max: number;
      step: number;
      anchors?: readonly [string, string];
    }
  | {
      id: string;
      type: "likert";
      text: string;
      points: number;
      anchors?: readonly [string, string];
    }
  | { id: string; type: "choice"; text: string; choices: string[] };

type Translate = ReturnType<typeof useTranslations<"kinds">>;

/** The instrument as a flat list of items; fixed instruments come from messages. */
function buildItems(config: QuestionnaireConfig, t: Translate): Item[] {
  if (config.instrument === "sam")
    return SAM_DIMENSIONS.map((dimension) => ({
      id: dimension,
      type: "sam",
      dimension,
    }));
  if (config.instrument === "nasa_tlx")
    return NASA_TLX_SCALES.map((scale) => ({
      id: scale,
      type: "slider",
      text: t(`questionnaire.nasa_tlx.${scale}.question`),
      min: 0,
      max: 100,
      step: 5,
      anchors: [
        t(`questionnaire.nasa_tlx.${scale}.low`),
        t(`questionnaire.nasa_tlx.${scale}.high`),
      ],
    }));
  return (config.items ?? []).map((item): Item => {
    if (config.instrument === "vas" || item.type === "slider")
      return {
        id: item.id,
        type: "slider",
        text: item.text,
        min: config.instrument === "vas" ? 0 : item.min,
        max: config.instrument === "vas" ? 100 : item.max,
        step: 1,
        anchors: item.anchors,
      };
    if (item.type === "likert")
      return {
        id: item.id,
        type: "likert",
        text: item.text,
        points: item.points,
        anchors: item.anchors,
      };
    return {
      id: item.id,
      type: "choice",
      text: item.text,
      choices: item.choices ?? [],
    };
  });
}

/** A row of mutually exclusive points, as an accessible radio group. */
function PointScale({
  label,
  count,
  value,
  onChange,
  optionLabel,
}: {
  label: string;
  count: number;
  value: number | undefined;
  onChange: (value: number) => void;
  optionLabel: (value: number) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => i + 1).map((point) => (
        <button
          key={point}
          type="button"
          role="radio"
          aria-checked={value === point}
          aria-label={optionLabel(point)}
          onClick={() => onChange(point)}
          className={cn(
            "mx-auto h-7 w-7 rounded-full border border-hairline transition-colors",
            value === point ? "bg-accent border-accent" : "bg-surface"
          )}
        />
      ))}
    </div>
  );
}

function Anchors({ anchors }: { anchors?: readonly [string, string] }) {
  if (!anchors) return null;
  return (
    <div className="flex justify-between type-caption text-ink-3">
      <span>{anchors[0]}</span>
      <span>{anchors[1]}</span>
    </div>
  );
}

function QuestionnaireRenderer(ctx: TaskContext<QuestionnaireConfig>) {
  const t = useTranslations("kinds");
  const { config } = ctx;
  const finish = useFinish(ctx, "questionnaire");
  const items = useMemo(() => buildItems(config, t), [config, t]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const set = (id: string) => (value: number) =>
    setAnswers((a) => ({ ...a, [id]: value }));
  const complete = items.every((item) => item.id in answers);

  const submit = () => {
    if (!complete) return;
    items.forEach((item, index) => {
      const value = answers[item.id];
      ctx.emit({
        label: "questionnaire_answer",
        kind: "response",
        meta: {
          instrument: config.instrument,
          item_id: item.id,
          item_index: index,
          value,
          ...(item.type === "choice"
            ? { choice_label: item.choices[value - 1] }
            : {}),
        },
      });
    });
    finish({ instrument: config.instrument, answers });
  };

  const pointLabel = (max: number) => (value: number) =>
    t("questionnaire.point", { value, max });

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-8">
      <div className="my-auto w-full max-w-2xl space-y-8">
        {config.prompt && (
          <p className="text-center text-xl leading-relaxed text-ink">
            {config.prompt}
          </p>
        )}
        {items.map((item) => {
          if (item.type === "sam") {
            const question = t(`questionnaire.sam.${item.dimension}.question`);
            return (
              <fieldset key={item.id} className="space-y-2">
                <legend className="mb-2 text-ink">{question}</legend>
                <div className="grid grid-cols-9">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="flex justify-center">
                      {i % 2 === 0 && (
                        <SamManikin dimension={item.dimension} level={i / 2} />
                      )}
                    </div>
                  ))}
                </div>
                <PointScale
                  label={question}
                  count={9}
                  value={answers[item.id]}
                  onChange={set(item.id)}
                  optionLabel={pointLabel(9)}
                />
                <Anchors
                  anchors={[
                    t(`questionnaire.sam.${item.dimension}.low`),
                    t(`questionnaire.sam.${item.dimension}.high`),
                  ]}
                />
              </fieldset>
            );
          }
          if (item.type === "slider")
            return (
              <fieldset key={item.id} className="space-y-2">
                <legend className="mb-2 text-ink">{item.text}</legend>
                <input
                  type="range"
                  aria-label={item.text}
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={answers[item.id] ?? (item.min + item.max) / 2}
                  onChange={(e) => set(item.id)(Number(e.target.value))}
                  className={cn(
                    "w-full accent-accent",
                    !(item.id in answers) && "opacity-60"
                  )}
                />
                <Anchors anchors={item.anchors} />
              </fieldset>
            );
          if (item.type === "likert")
            return (
              <fieldset key={item.id} className="space-y-2">
                <legend className="mb-2 text-ink">{item.text}</legend>
                <PointScale
                  label={item.text}
                  count={item.points}
                  value={answers[item.id]}
                  onChange={set(item.id)}
                  optionLabel={pointLabel(item.points)}
                />
                <Anchors anchors={item.anchors} />
              </fieldset>
            );
          return (
            <fieldset key={item.id} className="space-y-2">
              <legend className="mb-2 text-ink">{item.text}</legend>
              <div
                role="radiogroup"
                aria-label={item.text}
                className="grid gap-2"
              >
                {item.choices.map((choice, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={answers[item.id] === i + 1}
                    onClick={() => set(item.id)(i + 1)}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-4 py-2 text-left transition-colors",
                      answers[item.id] === i + 1
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-surface"
                    )}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="flex flex-col items-center gap-2">
          <Button onClick={submit} disabled={!complete}>
            {t("questionnaire.submit")}
          </Button>
          {!complete && (
            <p className="type-caption text-ink-3">
              {t("questionnaire.unanswered")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const questionnaireTaskKind: TaskKind<QuestionnaireConfig> = {
  name: "questionnaire",
  configSchema: questionnaireConfigSchema,
  Renderer: QuestionnaireRenderer,
};
