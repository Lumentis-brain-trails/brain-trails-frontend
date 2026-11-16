"use client";

/**
 * The Brain Landscape drawn with the reader's measures (backend V3-0016, amended
 * 2026-11-16): one landscape whose height is one measure and whose colour is another,
 * and "Add landscape" for more copies coloured other ways, turning together.
 *
 * The measures are `lib/landscapeLayers.ts`'s: the map's own time spent, a task's share
 * of time, time, reach or score, a label's average or threshold, a band's power, and
 * (colour only) the main task. Frequency measures switch to their energy view with one
 * click. The first landscape starts as the map always was. The reader's landscapes are
 * kept in this browser - a convenience, not a record - and repaired when a task, label or
 * band they named is gone.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  type Camera,
  DEFAULT_CAMERA,
} from "@/components/compare/LandscapeSurface";
import { useLabelNamer } from "@/components/compare/useLabelNamer";
import {
  type ColorKey,
  MeasureSurface,
  colorOf,
  measureRamp,
  useNoData,
} from "@/components/landscape/MeasureSurface";
import { Button, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { type BrainLandscape, hoverMatrix } from "@/lib/brainLandscape";
import {
  type ContinuousField,
  type LayerLabel,
  type LayerSource,
  MAX_VIEWS,
  type MeasureField,
  type MeasureKind,
  type MeasureSpec,
  type ViewSpec,
  computeMeasure,
  defaultThreshold,
  defaultView,
  isFrequency,
  layerTasks,
  measure,
  reviveViews,
  taskMetrics,
} from "@/lib/landscapeLayers";
import { useChartTheme } from "@/lib/theme";

const STORAGE_KEY = "bt-landscape-views";

function stored(): unknown {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function store(views: ViewSpec[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // a private window: the landscapes simply are not remembered
  }
}

/** A number at a precision its size deserves, without trailing zeros (5, 2.4, 0.37). */
function format(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

/** A label in the reader's words: a fixed instrument's item by name, a custom one by its question. */
function useLabelName() {
  const t = useTranslations("landscape.measures.items");
  return (label: LayerLabel) => {
    const key = `${label.instrument}.${label.item}`;
    if (t.has(key as never)) return t(key as never);
    return label.text ?? label.item;
  };
}

/** One entry of the measure menu: a measure with what it names, but no settings yet. */
interface Choice {
  key: string;
  group: "overall" | "task" | "label" | "band" | "category";
  groupName: string;
  spec: Pick<MeasureSpec, "kind" | "task" | "label" | "metric" | "band">;
}

const choiceKey = (spec: Choice["spec"]) =>
  JSON.stringify([spec.kind, spec.task, spec.label, spec.metric, spec.band]);

/** Every measure the person's data can draw, grouped as the menu shows them. */
function choicesOf(
  source: LayerSource | undefined,
  labelName: (label: LayerLabel) => string,
  t: ReturnType<typeof useTranslations<"landscape.measures">>
): Choice[] {
  const out: Choice[] = [];
  const add = (
    group: Choice["group"],
    groupName: string,
    spec: Choice["spec"]
  ) => out.push({ key: choiceKey(spec), group, groupName, spec });
  add("overall", t("groups.overall"), { kind: "map" });
  if (!source) return out;
  for (const task of layerTasks(source)) {
    for (const kind of ["share", "time", "reach"] as const)
      add("task", task, { kind, task });
    for (const metric of taskMetrics(source, task))
      add("task", task, { kind: "score", task, metric });
  }
  for (const label of source.labels)
    for (const kind of ["value", "threshold"] as const)
      add("label", labelName(label), { kind, label: label.key });
  for (const band of source.bands?.names ?? [])
    add("band", t("groups.band"), { kind: "band", band });
  if (layerTasks(source).length > 0)
    add("category", t("groups.category"), { kind: "main" });
  return out;
}

export function LandscapeViews({
  landscape,
  height = 520,
  title,
}: {
  landscape: BrainLandscape;
  height?: number;
  title: string;
}) {
  const t = useTranslations("landscape.measures");
  const labelName = useLabelName();
  const source = useQuery({
    queryKey: ["my-landscape-layers", landscape.version],
    queryFn: () => api.get<LayerSource>("landscape/layers"),
    retry: false,
    // a map built before scores and band power is being rebuilt for them: look again
    refetchInterval: (query) => (query.state.data?.stale ? 5000 : false),
  });
  const data = source.data;
  const remembered = useMemo(
    () => (data ? reviveViews(stored(), data) : null),
    [data]
  );
  const [own, setOwn] = useState<ViewSpec[] | null>(null);
  const views = own ?? remembered ?? [defaultView()];
  const setViews = (next: ViewSpec[]) => {
    setOwn(next);
    store(next);
  };
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const choices = useMemo(
    () => choicesOf(data, labelName, t),
    // labelName and t are stable per locale; the menu changes with the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  );

  return (
    <div className="space-y-6">
      {source.isError && (
        <p className="px-2 text-[14px] text-ink-2">{t("failed")}</p>
      )}
      {data?.stale && (
        <p className="px-2 text-[14px] text-ink-2">{t("stale")}</p>
      )}
      {views.map((view, n) => (
        <ViewCard
          key={view.id}
          n={n + 1}
          view={view}
          landscape={landscape}
          source={data}
          choices={choices}
          labelName={labelName}
          camera={camera}
          onCamera={setCamera}
          plotHeight={height}
          title={title}
          onChange={(next) =>
            setViews(views.map((v) => (v.id === view.id ? next : v)))
          }
          onRemove={
            views.length > 1
              ? () => setViews(views.filter((v) => v.id !== view.id))
              : undefined
          }
        />
      ))}
      <div className="px-2">
        {views.length < MAX_VIEWS ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const last = views[views.length - 1];
              setViews([
                ...views,
                {
                  id: `${Date.now().toString(36)}-${views.length}`,
                  height: last?.height ?? measure("map"),
                  color:
                    data && layerTasks(data).length > 0
                      ? measure("main")
                      : null,
                },
              ]);
            }}
          >
            {t("add")}
          </Button>
        ) : (
          <p className="type-caption text-ink-3">
            {t("full", { max: MAX_VIEWS })}
          </p>
        )}
      </div>
    </div>
  );
}

function ViewCard({
  n,
  view,
  landscape,
  source,
  choices,
  labelName,
  camera,
  onCamera,
  plotHeight,
  title,
  onChange,
  onRemove,
}: {
  n: number;
  view: ViewSpec;
  landscape: BrainLandscape;
  source: LayerSource | undefined;
  choices: Choice[];
  labelName: (label: LayerLabel) => string;
  camera: Camera;
  onCamera: (camera: Camera) => void;
  plotHeight: number;
  title: string;
  onChange: (view: ViewSpec) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("landscape.measures");
  const theme = useChartTheme();
  const noData = useNoData();
  const namer = useLabelNamer();

  const computed = useMemo(() => {
    const evaluate = (spec: MeasureSpec): MeasureField | null =>
      spec.kind === "map" || source
        ? computeMeasure(
            source ?? emptySource(landscape),
            landscape.grid.z,
            spec
          )
        : null;
    const heightField = evaluate(view.height);
    const height =
      heightField?.type === "continuous"
        ? heightField
        : (evaluate(measure("map")) as ContinuousField);
    const color = view.color ? evaluate(view.color) : null;
    return { height, color };
  }, [landscape, source, view]);

  const name = (spec: MeasureSpec): string => {
    const label = source?.labels.find((l) => l.key === spec.label);
    const subject = label ? labelName(label) : (spec.task ?? "");
    switch (spec.kind) {
      case "threshold":
        return t("name.threshold", {
          subject,
          direction: spec.direction ?? "above",
          threshold: format(
            spec.threshold ?? (label ? defaultThreshold(label) : 0.5)
          ),
        });
      case "score":
        return t("name.score", { subject, metric: spec.metric ?? "accuracy" });
      case "band":
        return t("name.band", { band: spec.band ?? "" });
      default:
        return t(`name.${spec.kind}`, { subject });
    }
  };

  const describe = (field: ContinuousField, v: number | null): string => {
    if (v === null) return t("unit.none");
    const percent = new Set([
      "density",
      "share",
      "reach",
      "threshold",
      "band",
      "accuracy",
    ]);
    return t(`unit.${field.unit}`, {
      value: percent.has(field.unit) ? Math.round(v * 100) : format(v),
    });
  };

  const hover = useMemo(() => {
    const happened = hoverMatrix(landscape, namer.category);
    const heightName = name(view.height);
    const colorName = view.color ? name(view.color) : null;
    const { height, color } = computed;
    return height.z.map((row, j) =>
      row.map((_, i) => {
        const lines = [
          `${heightName}: ${describe(height, height.value[j]?.[i] ?? null)}`,
        ];
        if (colorName && color) {
          if (color.type === "continuous")
            lines.push(
              `${colorName}: ${describe(color, color.value[j]?.[i] ?? null)}`
            );
          else {
            const c = color.category[j]?.[i];
            const share = color.share[j]?.[i];
            lines.push(
              c === null || c === undefined
                ? `${colorName}: ${t("unit.none")}`
                : t("unit.main", {
                    task: color.categories[c],
                    value: Math.round((share ?? 0) * 100),
                  })
            );
          }
        }
        if (happened[j]?.[i]) lines.push(happened[j][i]);
        return lines.join("<br>");
      })
    );
    // name and describe read only the view, the source and the locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, landscape, namer.category, view, source]);

  // coloured by its own height, a measure still greys where it knows too little: only
  // the map itself (never blank) keeps the plain height ramp
  const colorField: MeasureField | null =
    computed.color ??
    (view.height.kind === "map" && !view.height.energy
      ? null
      : computed.height);
  const painted = colorField
    ? colorOf(colorField, theme.landscape, noData)
    : null;
  const key: ColorKey | null = painted
    ? painted.key
    : { type: "ramp", low: 0, high: 1 };
  const keyField: ContinuousField | null =
    colorField?.type === "continuous"
      ? colorField
      : colorField
        ? null
        : computed.height;

  return (
    <section
      aria-label={t("landscapeN", { n })}
      className="space-y-3 border-b border-hairline pb-6 last:border-b-0"
    >
      <div className="flex flex-wrap items-start gap-3 px-2">
        <MeasurePicker
          role="height"
          spec={view.height}
          choices={choices.filter((c) => c.spec.kind !== "main")}
          source={source}
          onChange={(height) => height && onChange({ ...view, height })}
        />
        <MeasurePicker
          role="color"
          spec={view.color}
          choices={choices}
          source={source}
          onChange={(color) => onChange({ ...view, color })}
        />
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={onRemove}
            aria-label={t("remove", { n })}
          >
            {t("removeShort")}
          </Button>
        )}
      </div>
      {view.color && source && computed.color === null && (
        <p className="type-caption px-2 text-ink-3">{t("empty")}</p>
      )}
      <MeasureSurface
        landscape={landscape}
        height={computed.height}
        color={painted}
        hover={hover}
        camera={camera}
        onCamera={onCamera}
        plotHeight={plotHeight}
        title={`${title} · ${t("aria", {
          height: name(view.height),
          color: view.color ? name(view.color) : name(view.height),
        })}`}
      />
      <Key
        colorKey={key}
        field={keyField}
        ramp={painted ? measureRamp(theme.landscape) : theme.landscape}
        noData={noData}
        format={(v) => (keyField ? describe(keyField, v) : format(v))}
        name={view.color ? name(view.color) : name(view.height)}
        hasNoData={painted !== null}
      />
    </section>
  );
}

/** A stand-in for a map whose layer table has not arrived: only `map` reads it. */
function emptySource(landscape: BrainLandscape): LayerSource {
  return {
    version: landscape.version,
    epoch: 1,
    pending: false,
    stale: false,
    bounds: landscape.bounds,
    sigma: 1,
    nx: landscape.grid.nx,
    ny: landscape.grid.ny,
    runs: [],
    labels: [],
    answers: [],
  };
}

/** What the colour means: a ramp from its lowest to its highest value, or the categories. */
function Key({
  colorKey,
  field,
  ramp,
  noData,
  format,
  name,
  hasNoData,
}: {
  colorKey: ColorKey | null;
  field: ContinuousField | null;
  ramp: readonly (readonly [number, string])[];
  noData: string;
  format: (value: number) => string;
  name: string;
  hasNoData: boolean;
}) {
  const t = useTranslations("landscape.measures");
  if (!colorKey) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-[13px] text-ink-2">
      <span className="font-medium">{name}</span>
      {colorKey.type === "ramp" && field ? (
        <span className="flex items-center gap-2">
          <span>{format(colorKey.low)}</span>
          <span
            aria-hidden
            className="h-2.5 w-40 rounded-full"
            style={{
              background: `linear-gradient(to right, ${ramp
                .map(([at, c]) => `${c} ${Math.round(at * 100)}%`)
                .join(", ")})`,
            }}
          />
          <span>{format(colorKey.high)}</span>
        </span>
      ) : colorKey.type === "categories" ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {colorKey.entries.map((entry) => (
            <li key={entry.name} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </li>
          ))}
        </ul>
      ) : null}
      {hasNoData && (
        <span className="flex items-center gap-1.5 text-ink-3">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: noData }}
          />
          {t("noData")}
        </span>
      )}
    </div>
  );
}

/**
 * One measure's menu and its settings: the threshold of a threshold measure, the energy
 * view of a frequency one. The colour's menu also offers "same as the height".
 */
function MeasurePicker({
  role,
  spec,
  choices,
  source,
  onChange,
}: {
  role: "height" | "color";
  spec: MeasureSpec | null;
  choices: Choice[];
  source: LayerSource | undefined;
  /** Null only from the colour's "same as the height". */
  onChange: (spec: MeasureSpec | null) => void;
}) {
  const t = useTranslations("landscape.measures");
  const groups = new Map<string, Choice[]>();
  for (const choice of choices) {
    const id = `${choice.group}:${choice.groupName}`;
    groups.set(id, [...(groups.get(id) ?? []), choice]);
  }
  const current = spec ? choiceKey(spec) : "";
  const label = source?.labels.find((l) => l.key === spec?.label);
  const scale = label?.scale ?? [0, 1];
  const optionName = (choice: Choice) => {
    const option =
      choice.spec.kind === "score"
        ? t("options.score", { metric: choice.spec.metric ?? "accuracy" })
        : choice.spec.kind === "band"
          ? t("options.band", { band: choice.spec.band ?? "" })
          : t(`options.${choice.spec.kind}`);
    // a task's or a label's measures name it: the closed menu shows the option alone
    return choice.group === "task" || choice.group === "label"
      ? t("options.subject", { subject: choice.groupName, option })
      : option;
  };
  const set = (change: Partial<MeasureSpec>) =>
    spec && onChange({ ...spec, ...change });

  return (
    <div className="min-w-[14rem] flex-1 space-y-2 sm:max-w-sm">
      <label className="block text-[13px] font-medium text-ink-2">
        {t(role)}
        <Select
          value={current}
          onChange={(e) => {
            const choice = choices.find((c) => c.key === e.target.value);
            if (!choice) {
              onChange(null);
              return;
            }
            const found = source?.labels.find(
              (l) => l.key === choice.spec.label
            );
            onChange(
              measure(choice.spec.kind as MeasureKind, {
                ...choice.spec,
                ...(choice.spec.kind === "threshold" && found
                  ? { threshold: defaultThreshold(found), direction: "above" }
                  : {}),
              })
            );
          }}
          className="mt-1 h-9 text-[14px]"
        >
          {role === "color" && <option value="">{t("sameAsHeight")}</option>}
          {[...groups.values()].map((list) => (
            <optgroup key={list[0].key} label={list[0].groupName}>
              {list.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {optionName(choice)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      {spec && (
        <p className="type-caption text-ink-3">{t(`explain.${spec.kind}`)}</p>
      )}
      {spec?.kind === "threshold" && label && (
        <div className="grid grid-cols-2 gap-2 text-[13px] text-ink-2">
          <Select
            aria-label={t("direction")}
            value={spec.direction ?? "above"}
            onChange={(e) =>
              set({ direction: e.target.value as "above" | "below" })
            }
            className="h-8 text-[13px]"
          >
            <option value="above">{t("above")}</option>
            <option value="below">{t("below")}</option>
          </Select>
          <Input
            type="number"
            aria-label={t("threshold")}
            min={scale[0]}
            max={scale[1]}
            step={(scale[1] - scale[0]) / 20}
            value={spec.threshold ?? defaultThreshold(label)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) set({ threshold: v });
            }}
            className="h-8 text-[13px]"
          />
        </div>
      )}
      {spec && isFrequency(spec.kind) && (
        <div className="space-y-2 text-[13px] text-ink-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={spec.energy}
              onChange={(e) => set({ energy: e.target.checked })}
            />
            {t("energy")}
          </label>
          {spec.energy && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1">
                {t("epsilon")}
                <Input
                  type="number"
                  min={0.0001}
                  max={1}
                  step={0.001}
                  value={spec.epsilon}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) set({ epsilon: v });
                  }}
                  className="h-8 w-24 text-[13px]"
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={spec.cutoff !== null}
                  onChange={(e) =>
                    set({
                      cutoff: e.target.checked
                        ? Math.round(-Math.log(spec.epsilon) * 50) / 100
                        : null,
                    })
                  }
                />
                {t("cutoff")}
              </label>
              {spec.cutoff !== null && (
                <Input
                  type="number"
                  aria-label={t("cutoff")}
                  min={0.01}
                  step={0.1}
                  value={spec.cutoff}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) set({ cutoff: v });
                  }}
                  className="h-8 w-20 text-[13px]"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
