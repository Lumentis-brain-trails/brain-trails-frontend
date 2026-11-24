"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  cn,
} from "@/components/ui";
import { useOps, useOpsEnv } from "@console/components/env";
import { useErrorText } from "@console/components/useErrorText";
import type { LabOptions, LabRun } from "@console/lib/client";
import {
  LABEL_SOURCES,
  type LabForm,
  METRICS,
  type Option,
  labelValues,
  problems,
  toExperiment,
} from "../lib/lab";

/** One step of the pipeline, numbered in the order the data flows through it. */
function Step({
  n,
  title,
  standard,
  children,
}: {
  n: number;
  title: string;
  /** A phase-2 step: drawn, fixed, and said so. */
  standard?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("console.pipelineLab");
  return (
    <Card className={cn("grid gap-4", standard !== undefined && "opacity-80")}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[13px] text-ink-3 tabular-nums">
          {n}
        </span>
        <h3 className="type-heading">{title}</h3>
        {standard !== undefined && (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-2">
            {t("standard")}
          </span>
        )}
      </div>
      {standard !== undefined && (
        <p className="text-[14px] text-ink-2">
          {standard} <span className="text-ink-3">{t("phase2")}</span>
        </p>
      )}
      {children}
    </Card>
  );
}

/** A select over the options an environment offers, with "any" first. */
function OptionSelect({
  value,
  onChange,
  options,
  empty,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  empty: string;
}) {
  const t = useTranslations("console.pipelineLab");
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {t("option", { label: o.label ?? o.value, recordings: o.recordings })}
        </option>
      ))}
    </Select>
  );
}

/**
 * The experiment, as the pipeline's eight steps top to bottom: the question, the data,
 * the three phase-2 steps (standard), the reduction, the graph and the NeuroMetrics.
 * The choices come from the environment being read; sending stores the run and opens
 * it while bt-ops works.
 */
export function ExperimentForm({
  initial,
  onStarted,
}: {
  initial: LabForm;
  onStarted: (run: LabRun) => void;
}) {
  const t = useTranslations("console.pipelineLab");
  const tEnv = useTranslations("console.env");
  const format = useFormatter();
  const errorText = useErrorText();
  const envOps = useOps();
  const { env, cacheKey } = useOpsEnv();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LabForm>(initial);
  const [tried, setTried] = useState(false);
  const options = useQuery({
    queryKey: ["lab-options", cacheKey],
    queryFn: () => envOps.get<LabOptions>("lab/options"),
  });
  const start = useMutation({
    mutationFn: () => envOps.post<LabRun>("lab/runs", toExperiment(form)),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ["lab-runs"] });
      onStarted(run);
    },
  });

  if (options.isPending) return <Skeleton className="h-96" />;
  if (options.isError || !options.data)
    return <ErrorBanner message={errorText(options.error)} />;
  const o = options.data;
  const envName = tEnv(`name.${env ?? o.env}`);
  if (!o.available) {
    return (
      <Card>
        <EmptyState
          title={t("unavailableTitle", { env: envName })}
          text={t("unavailableText")}
        />
        {o.reason && (
          <p className="text-center font-mono text-[12px] text-ink-3">
            {o.reason}
          </p>
        )}
      </Card>
    );
  }

  const set = <K extends keyof LabForm>(key: K, value: LabForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const found = problems(form, o.caps.max_recordings);
  const shown = tried ? found : [];
  const values = labelValues(o, form.label, form.contextItem);
  const day = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "–";

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (found.length === 0) start.mutate();
      }}
    >
      <p className="text-[14px] text-ink-2">
        {t("overview", {
          env: envName,
          recordings: o.recordings,
          people: o.people,
          research: o.research_recordings,
        })}{" "}
        {o.date_first &&
          t("span", { first: day(o.date_first), last: day(o.date_last) })}
      </p>

      <Card>
        <Field
          label={t("title")}
          error={shown.includes("title") ? t("problems.title") : undefined}
        >
          <Input
            value={form.title}
            maxLength={200}
            placeholder={t("titlePlaceholder")}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
      </Card>

      <Step n={1} title={t("question.title")}>
        <Segmented
          label={t("question.kind")}
          value={form.kind}
          onChange={(kind) => set("kind", kind)}
          options={[
            { value: "explore", label: t("question.explore") },
            { value: "ab", label: t("question.ab") },
          ]}
        />
        <p className="text-[13px] text-ink-3">
          {form.kind === "ab"
            ? t("question.abHint")
            : t("question.exploreHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("question.label")}
            error={shown.includes("label") ? t("problems.label") : undefined}
          >
            <Select
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  label: e.target.value as LabForm["label"],
                  a: "",
                  b: "",
                }))
              }
            >
              <option value="">{t("question.labelNone")}</option>
              {LABEL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`question.source.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          {form.label === "context" && (
            <Field
              label={t("question.contextItem")}
              error={
                shown.includes("contextItem")
                  ? t("problems.contextItem")
                  : undefined
              }
            >
              <Select
                value={form.contextItem}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    contextItem: e.target.value,
                    a: "",
                    b: "",
                  }))
                }
              >
                <option value="">{t("choose")}</option>
                {o.context_items.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {form.kind === "ab" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <Field
                key={side}
                label={t(`question.${side}`)}
                error={
                  side === "b" && shown.includes("values")
                    ? t("problems.values")
                    : side === "b" && shown.includes("sameValues")
                      ? t("problems.sameValues")
                      : undefined
                }
              >
                <OptionSelect
                  value={form[side]}
                  onChange={(v) => set(side, v)}
                  options={values}
                  empty={t("choose")}
                />
              </Field>
            ))}
          </div>
        )}
      </Step>

      <Step n={2} title={t("data.title")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("data.protocol")}>
            <OptionSelect
              value={form.protocolId}
              onChange={(v) => set("protocolId", v)}
              options={o.protocols}
              empty={t("any")}
            />
          </Field>
          <Field label={t("data.blockKind")}>
            <OptionSelect
              value={form.blockKind}
              onChange={(v) => set("blockKind", v)}
              options={o.block_kinds}
              empty={t("any")}
            />
          </Field>
          <Field label={t("data.blockLabel")}>
            <OptionSelect
              value={form.blockLabel}
              onChange={(v) => set("blockLabel", v)}
              options={o.block_labels}
              empty={t("any")}
            />
          </Field>
          <Field label={t("data.ageBand")}>
            <OptionSelect
              value={form.ageBand}
              onChange={(v) => set("ageBand", v)}
              options={o.age_bands}
              empty={t("any")}
            />
          </Field>
          <Field label={t("data.sex")}>
            <OptionSelect
              value={form.sex}
              onChange={(v) => set("sex", v)}
              options={o.sexes}
              empty={t("any")}
            />
          </Field>
          <Field label={t("data.device")}>
            <OptionSelect
              value={form.device}
              onChange={(v) => set("device", v)}
              options={o.devices}
              empty={t("any")}
            />
          </Field>
          <Field
            label={t("data.dateFrom")}
            error={shown.includes("dates") ? t("problems.dates") : undefined}
          >
            <Input
              type="date"
              value={form.dateFrom}
              onChange={(e) => set("dateFrom", e.target.value)}
            />
          </Field>
          <Field label={t("data.dateTo")}>
            <Input
              type="date"
              value={form.dateTo}
              onChange={(e) => set("dateTo", e.target.value)}
            />
          </Field>
          <Field label={t("data.minQuality")}>
            <Select
              value={form.minQuality}
              onChange={(e) =>
                set("minQuality", e.target.value as LabForm["minQuality"])
              }
            >
              <option value="">{t("any")}</option>
              <option value="usable">{t("data.quality.usable")}</option>
              <option value="good">{t("data.quality.good")}</option>
            </Select>
          </Field>
          <Field
            label={t("data.maxRecordings")}
            hint={t("data.maxHint", { max: o.caps.max_recordings })}
            error={
              shown.includes("maxRecordings")
                ? t("problems.maxRecordings", { max: o.caps.max_recordings })
                : undefined
            }
          >
            <Input
              type="number"
              min={1}
              max={o.caps.max_recordings}
              value={Number.isNaN(form.maxRecordings) ? "" : form.maxRecordings}
              onChange={(e) => set("maxRecordings", e.target.valueAsNumber)}
            />
          </Field>
        </div>
        <label className="flex items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.researchOnly}
            onChange={(e) => set("researchOnly", e.target.checked)}
          />
          <span>
            {t("data.researchOnly")}
            <span className="block text-[13px] text-ink-3">
              {t("data.researchHint")}
            </span>
          </span>
        </label>
      </Step>

      <Step
        n={3}
        title={t("preprocessing.title")}
        standard={t("preprocessing.text")}
      />
      <Step n={4} title={t("artefacts.title")} standard={t("artefacts.text")} />
      <Step n={5} title={t("encoding.title")} standard={t("encoding.text")} />

      <Step n={6} title={t("reduction.title")}>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
            {t("reduction.method")}
          </legend>
          <div className="flex flex-wrap gap-4 text-[14px]">
            {o.reductions.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reduction"
                  value={m}
                  checked={form.method === m}
                  onChange={() => set("method", m as LabForm["method"])}
                />
                {m === "pca" || m === "tsne" ? t(`reduction.${m}`) : m}
              </label>
            ))}
            {o.unavailable_reductions.map((m) => (
              <label key={m} className="flex items-center gap-2 text-ink-3">
                <input type="radio" name="reduction" value={m} disabled />
                {m === "umap" ? t("reduction.umap") : m}
              </label>
            ))}
          </div>
          {o.unavailable_reductions.includes("umap") && (
            <p className="text-[13px] text-ink-3">{t("reduction.umapNote")}</p>
          )}
        </fieldset>
        {form.method === "tsne" && (
          <div className="grid gap-2 sm:max-w-xs">
            <Field
              label={t("reduction.perplexity")}
              error={
                shown.includes("perplexity")
                  ? t("problems.perplexity")
                  : undefined
              }
            >
              <Input
                type="number"
                min={5}
                max={100}
                step={1}
                value={Number.isNaN(form.perplexity) ? "" : form.perplexity}
                onChange={(e) => set("perplexity", e.target.valueAsNumber)}
              />
            </Field>
          </div>
        )}
        <p className="text-[13px] text-ink-3">
          {form.method === "tsne"
            ? t("reduction.tsneNote", { points: o.caps.points })
            : t("reduction.pcaNote")}
        </p>
      </Step>

      <Step n={7} title={t("graph.title")}>
        <div className="sm:max-w-xs">
          <Field
            label={t("graph.eps")}
            hint={t("graph.epsHint", { nodes: o.caps.max_nodes })}
            error={shown.includes("eps") ? t("problems.eps") : undefined}
          >
            <Input
              inputMode="decimal"
              value={form.eps}
              onChange={(e) => set("eps", e.target.value)}
            />
          </Field>
        </div>
      </Step>

      <Step n={8} title={t("metrics.title")}>
        <div className="flex flex-wrap gap-4 text-[14px]">
          {METRICS.map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.metrics.includes(m)}
                onChange={(e) =>
                  set(
                    "metrics",
                    e.target.checked
                      ? [...form.metrics, m]
                      : form.metrics.filter((x) => x !== m)
                  )
                }
              />
              {t(`metrics.${m}`)}
            </label>
          ))}
        </div>
        {shown.includes("metrics") && (
          <p role="alert" className="text-[13px] text-danger">
            {t("problems.metrics")}
          </p>
        )}
      </Step>

      {start.isError && <ErrorBanner message={errorText(start.error)} />}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? t("starting") : t("start")}
        </Button>
        <p className="text-[13px] text-ink-3">
          {t("caps", {
            windows: o.caps.max_windows,
            perPerson: o.caps.max_windows_per_person,
            minutes: Math.round(o.caps.time_limit_s / 60),
          })}
        </p>
      </div>
    </form>
  );
}
