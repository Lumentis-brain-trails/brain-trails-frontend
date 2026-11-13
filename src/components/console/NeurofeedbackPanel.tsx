"use client";

/**
 * The console's neurofeedback panel (backend V4-0009): what the block on the
 * participant's screen is doing - the live value against the threshold, in target or
 * not, gated or not, the running time in target - and the threshold's -/+ (each a 5%
 * `nudge_threshold`, applied and logged by the runner, never by the console).
 *
 * It reads `NfPanel`, folded from the runner's own `nf_*` events: the operator sees the
 * numbers the session records, not a second computation.
 */

import { useTranslations } from "next-intl";
import { Button, Card, cn } from "@/components/ui";
import { type NfPanel, timeInTarget } from "@/lib/neurofeedback/panel";

const GATES = ["amplitude", "muscle", "flat", "gap"] as const;

const fmt = (v: number | null) =>
  v === null ? "-" : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);

export function NeurofeedbackPanel({
  panel,
  disabled,
  nudge,
}: {
  panel: NfPanel;
  disabled: boolean;
  nudge: (steps: number) => void;
}) {
  const t = useTranslations("console.neurofeedback");
  const share = timeInTarget(panel);
  const gate = GATES.find((g) => g === panel.gated);
  const state = gate
    ? t("gated", { reason: t(`gate.${gate}`) })
    : panel.phase === "baseline"
      ? t("baseline")
      : panel.inTarget === true
        ? t("inTarget")
        : panel.inTarget === false
          ? t("outOfTarget")
          : t("waiting");
  return (
    <Card>
      <h2 className="type-subhead mb-3">{t("title")}</h2>
      <div
        role="status"
        aria-live="off"
        className={cn(
          "mb-3 rounded-[var(--radius-control)] px-3 py-2 text-[15px]",
          panel.inTarget === true && !panel.gated
            ? "bg-(--ok-soft) text-ink"
            : "bg-surface-2 text-ink-2"
        )}
      >
        {state}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px] tabular-nums">
        <dt className="text-ink-3">{t("value")}</dt>
        <dd data-testid="nf-value">{fmt(panel.smoothed)}</dd>
        <dt className="text-ink-3">{t("threshold")}</dt>
        <dd data-testid="nf-threshold">{fmt(panel.threshold)}</dd>
        <dt className="text-ink-3">{t("timeInTarget")}</dt>
        <dd>{share === null ? "-" : `${Math.round(share * 100)}%`}</dd>
        <dt className="text-ink-3">{t("latency")}</dt>
        <dd>{panel.ageMs === null ? "-" : `${panel.ageMs} ms`}</dd>
      </dl>
      {panel.alert && (
        <p className="type-caption mt-3 text-ink-2">
          {t(`alert.${panel.alert}`)}
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[14px] text-ink-2">{t("thresholdLabel")}</span>
        <Button
          variant="secondary"
          disabled={disabled || panel.threshold === null}
          aria-label={t("lower")}
          onClick={() => nudge(-1)}
        >
          -5%
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || panel.threshold === null}
          aria-label={t("raise")}
          onClick={() => nudge(1)}
        >
          +5%
        </Button>
        {panel.nudges > 0 && (
          <span className="type-caption text-ink-3">
            {t("nudges", { n: panel.nudges })}
          </span>
        )}
      </div>
      <p className="type-caption mt-3 text-ink-3">{t("disclaimer")}</p>
    </Card>
  );
}
