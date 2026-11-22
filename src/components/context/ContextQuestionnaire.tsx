"use client";

/**
 * The context questionnaire shown before a recording (backend `app/context.py`).
 *
 * A few taps, each answer optional: emotions (several at once), focus, sleep, fatigue
 * and stress on five emoji points from worst to best, and what happened in the last
 * two hours or day. Continue hands the answers to the run, which stores them with the
 * session once Start has created it; Skip hands `null`, which is stored as a skip -
 * a missing answer is information too. The list is the person's own (`/account`).
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Input, Skeleton, cn } from "@/components/ui";
import { useContextWords } from "@/components/context/contextWords";
import {
  type ContextAnswers,
  type ContextItem,
  askedItems,
  parseNumber,
  toggleOption,
  useContextVariables,
} from "@/lib/context";

export function ContextQuestionnaire({
  onDone,
  personaliseHref = "/account#context",
}: {
  /** The answers, or `null` when the person skipped. */
  onDone: (answers: ContextAnswers | null) => void;
  /** Where "Personalise" leads; `null` hides it (the client shell has no account page). */
  personaliseHref?: string | null;
}) {
  const t = useTranslations("context");
  const list = useContextVariables();
  const [answers, setAnswers] = useState<ContextAnswers>({});

  if (list.isError) {
    // The run must not depend on the questionnaire: without a list, carry on unasked.
    return (
      <Card>
        <p className="mb-4 text-ink-2">{t("unavailable")}</p>
        <Button onClick={() => onDone(null)}>{t("continue")}</Button>
      </Card>
    );
  }
  if (!list.data)
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );

  const items = askedItems(list.data.items);
  const set = (key: string, value: ContextAnswers[string] | undefined) =>
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <Card>
      <h2 className="type-heading mb-1">{t("title")}</h2>
      <p className="mb-6 text-ink-2">{t("intro")}</p>
      <div className="space-y-7">
        {items.map((item) => (
          <Question
            key={item.key}
            item={item}
            value={answers[item.key]}
            onChange={(value) => set(item.key, value)}
          />
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        {personaliseHref ? (
          <Link
            href={personaliseHref}
            className="text-[14px] text-accent hover:underline"
          >
            {t("personalise")}
          </Link>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onDone(null)}>
            {t("skip")}
          </Button>
          <Button onClick={() => onDone(answers)}>{t("continue")}</Button>
        </div>
      </div>
    </Card>
  );
}

function Question({
  item,
  value,
  onChange,
}: {
  item: ContextItem;
  value: ContextAnswers[string] | undefined;
  onChange: (value: ContextAnswers[string] | undefined) => void;
}) {
  const t = useTranslations("context");
  const words = useContextWords();
  const title = words.item(item);
  const hint =
    words.hint(item) ?? (item.kind === "multi" ? t("pickAll") : null);
  const [raw, setRaw] = useState(
    typeof value === "number" ? String(value) : ""
  );

  return (
    <fieldset>
      <legend className="mb-1 font-medium">
        {item.emoji ? `${item.emoji} ` : ""}
        {title}
      </legend>
      {hint && <p className="type-caption mb-2 text-ink-3">{hint}</p>}
      {item.kind === "number" ? (
        <Input
          type="number"
          inputMode="decimal"
          className="mt-1 max-w-32"
          min={item.minimum ?? undefined}
          max={item.maximum ?? undefined}
          step={item.step ?? undefined}
          value={raw}
          aria-label={title}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange(parseNumber(item, e.target.value));
          }}
        />
      ) : item.kind === "scale" ? (
        <div
          role="radiogroup"
          aria-label={title}
          className="mt-1 grid grid-cols-5 gap-1.5"
        >
          {item.options.map((option) => {
            const point = Number(option.key);
            const active = value === point;
            const label = words.point(item, option.key);
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label ?? option.key}
                onClick={() => onChange(active ? undefined : point)}
                className={cn(
                  "pressable flex min-h-16 flex-col items-center justify-start gap-1 rounded-[var(--radius-control)] border px-1 py-2 text-center",
                  active
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-hairline text-ink-2 hover:bg-surface-2"
                )}
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  {option.emoji || option.key}
                </span>
                {label && (
                  <span className="text-[11px] leading-tight">{label}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          role={item.kind === "single" ? "radiogroup" : "group"}
          aria-label={title}
          className="mt-1 flex flex-wrap gap-1.5"
        >
          {item.options.map((option) => {
            const active =
              item.kind === "multi"
                ? Array.isArray(value) && value.includes(option.key)
                : value === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role={item.kind === "single" ? "radio" : "checkbox"}
                aria-checked={active}
                onClick={() =>
                  onChange(
                    item.kind === "multi"
                      ? toggleOption(item, value, option.key)
                      : active
                        ? undefined
                        : option.key
                  )
                }
                className={cn(
                  "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[14px]",
                  active
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-hairline text-ink-2 hover:bg-surface-2"
                )}
              >
                {option.emoji && <span aria-hidden>{option.emoji}</span>}
                {words.option(item, option)}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
