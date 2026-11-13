"use client";

/**
 * The Brain Landscape with the reader's own layers (backend V3-0016, amended
 * 2026-11-13): the map, and beside it the list of layers raised over it.
 *
 * A layer is a task's time or reach, or a self-reported label's average or threshold
 * (`lib/landscapeLayers.ts`), in a colour the reader picks; frequency layers switch to
 * their energy view with one click. With no layer shown, the map is drawn as it always
 * was, with its hover of what happened where. The reader's layers are kept in this
 * browser - a convenience, not a record - and dropped when their task or label is gone.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import {
  type DrawnLayer,
  LayeredSurface,
} from "@/components/landscape/LayeredSurface";
import { Button, Input, Select, cn } from "@/components/ui";
import { api } from "@/lib/api";
import type { BrainLandscape } from "@/lib/brainLandscape";
import {
  DEFAULT_EPSILON,
  LAYER_COLORS,
  LAYER_KINDS,
  type LayerField,
  type LayerKind,
  type LayerLabel,
  type LayerSource,
  type LayerSpec,
  computeLayer,
  defaultThreshold,
  isFrequency,
  layerTasks,
  reviveLayers,
} from "@/lib/landscapeLayers";

const STORAGE_KEY = "bt-landscape-layers";

function stored(): unknown {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function store(layers: LayerSpec[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // a private window: the layers simply are not remembered
  }
}

/** A label in the reader's words: a fixed instrument's item by name, a custom one by its question. */
function useLabelName() {
  const t = useTranslations("landscape.layers.items");
  return (label: LayerLabel) => {
    const key = `${label.instrument}.${label.item}`;
    if (t.has(key as never)) return t(key as never);
    return label.text ?? label.item;
  };
}

export function LandscapeLayers({
  landscape,
  height = 560,
  title,
}: {
  landscape: BrainLandscape;
  height?: number;
  title: string;
}) {
  const t = useTranslations("landscape.layers");
  const labelName = useLabelName();
  const source = useQuery({
    queryKey: ["my-landscape-layers", landscape.version],
    queryFn: () => api.get<LayerSource>("landscape/layers"),
    retry: false,
    // a map built before layers is being rebuilt for them: look again until it is
    refetchInterval: (query) => (query.state.data?.stale ? 5000 : false),
  });
  const data = source.data;
  const [ground, setGround] = useState(true);
  // the stored layers, read once the person's tasks and labels are known; the reader's
  // own changes replace them from then on
  const remembered = useMemo(
    () => (data ? reviveLayers(stored(), data) : null),
    [data]
  );
  const [own, setOwn] = useState<LayerSpec[] | null>(null);
  const layers = useMemo(() => own ?? remembered ?? [], [own, remembered]);
  const setLayers = (change: (all: LayerSpec[]) => LayerSpec[]) => {
    const next = change(layers);
    setOwn(next);
    store(next);
  };

  const tasks = useMemo(() => (data ? layerTasks(data) : []), [data]);
  const labels = data?.labels ?? [];

  const fields = useMemo(() => {
    const out = new Map<string, LayerField>();
    if (!data) return out;
    for (const spec of layers ?? []) {
      if (!spec.visible) continue;
      const field = computeLayer(data, spec);
      if (field) out.set(spec.id, field);
    }
    return out;
  }, [data, layers]);

  const nameOf = (spec: LayerSpec) => {
    const label = labels.find((l) => l.key === spec.label);
    const subject =
      spec.kind === "time" || spec.kind === "reach"
        ? (spec.task ?? "")
        : label
          ? labelName(label)
          : "";
    if (spec.kind === "threshold" && label) {
      return t(`name.threshold`, {
        subject,
        direction: spec.direction ?? "above",
        threshold: format(spec.threshold ?? defaultThreshold(label)),
      });
    }
    return t(`name.${spec.kind}`, { subject });
  };

  const drawn: DrawnLayer[] = layers.flatMap((spec) => {
    const field = fields.get(spec.id);
    if (!field) return [];
    const name = nameOf(spec);
    const hover = field.value.map((row) =>
      row.map((v) =>
        v === null
          ? ""
          : `${name}<br>${t(`unit.${field.unit}`, {
              value:
                field.unit === "reach" || field.unit === "threshold"
                  ? Math.round(v * 100)
                  : format(v),
            })}`
      )
    );
    return [{ id: spec.id, name, color: spec.color, field, hover }];
  });

  const update = (id: string, change: Partial<LayerSpec>) =>
    setLayers((all) => all.map((l) => (l.id === id ? { ...l, ...change } : l)));

  return (
    <div className="space-y-4">
      <div>
        {drawn.length > 0 ? (
          <LayeredSurface
            landscape={landscape}
            layers={drawn}
            ground={ground}
            height={height}
            title={title}
          />
        ) : (
          <LandscapeSurface
            landscape={landscape}
            height={height}
            title={title}
          />
        )}
      </div>
      <aside
        aria-label={t("title")}
        className="space-y-4 border-t border-hairline px-2 pt-4"
      >
        <div>
          <h2 className="type-headline">{t("title")}</h2>
          <p className="type-caption mt-1 text-ink-3">{t("intro")}</p>
        </div>
        {source.isError && (
          <p className="text-[14px] text-ink-2">{t("failed")}</p>
        )}
        {data?.stale && <p className="text-[14px] text-ink-2">{t("stale")}</p>}
        {data && !data.stale && (
          <>
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input
                type="checkbox"
                checked={ground}
                onChange={(e) => setGround(e.target.checked)}
              />
              {t("ground")}
            </label>
            <ul className="grid gap-3 sm:grid-cols-2">
              {layers.map((spec) => (
                <LayerRow
                  key={spec.id}
                  spec={spec}
                  name={nameOf(spec)}
                  label={labels.find((l) => l.key === spec.label)}
                  missing={spec.visible && !fields.has(spec.id)}
                  onChange={(change) => update(spec.id, change)}
                  onRemove={() =>
                    setLayers((all) => all.filter((l) => l.id !== spec.id))
                  }
                />
              ))}
            </ul>
            <AddLayer
              tasks={tasks}
              labels={labels}
              labelName={labelName}
              onAdd={(spec) =>
                setLayers((all) => {
                  const list = all;
                  return [
                    ...list,
                    {
                      ...spec,
                      id: `${Date.now().toString(36)}-${list.length}`,
                      color: LAYER_COLORS[list.length % LAYER_COLORS.length],
                      visible: true,
                      energy: false,
                      epsilon: DEFAULT_EPSILON,
                      cutoff: null,
                    },
                  ];
                })
              }
            />
          </>
        )}
      </aside>
    </div>
  );
}

/** A number at a precision its size deserves, without trailing zeros (5, 2.4, 0.37). */
function format(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

function LayerRow({
  spec,
  name,
  label,
  missing,
  onChange,
  onRemove,
}: {
  spec: LayerSpec;
  name: string;
  label: LayerLabel | undefined;
  missing: boolean;
  onChange: (change: Partial<LayerSpec>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("landscape.layers");
  const scale = label?.scale ?? [0, 1];
  return (
    <li className="rounded-[var(--radius-control)] border border-hairline p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={spec.color}
          aria-label={t("color", { name })}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={spec.visible}
            onChange={(e) => onChange({ visible: e.target.checked })}
          />
          <span className="truncate">{name}</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={t("remove", { name })}
        >
          {t("removeShort")}
        </Button>
      </div>
      {missing && <p className="type-caption mt-1 text-ink-3">{t("empty")}</p>}
      {spec.kind === "threshold" && label && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] text-ink-2">
          <Select
            aria-label={t("direction")}
            value={spec.direction ?? "above"}
            onChange={(e) =>
              onChange({ direction: e.target.value as "above" | "below" })
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
              if (Number.isFinite(v)) onChange({ threshold: v });
            }}
            className="h-8 text-[13px]"
          />
        </div>
      )}
      {isFrequency(spec.kind) && (
        <div className="mt-2 space-y-2 text-[13px] text-ink-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={spec.energy}
              onChange={(e) => onChange({ energy: e.target.checked })}
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
                    if (v > 0) onChange({ epsilon: v });
                  }}
                  className="h-8 w-24 text-[13px]"
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={spec.cutoff !== null}
                  onChange={(e) =>
                    onChange({
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
                    if (v > 0) onChange({ cutoff: v });
                  }}
                  className="h-8 w-20 text-[13px]"
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AddLayer({
  tasks,
  labels,
  labelName,
  onAdd,
}: {
  tasks: string[];
  labels: readonly LayerLabel[];
  labelName: (label: LayerLabel) => string;
  onAdd: (
    spec: Pick<LayerSpec, "kind" | "task" | "label" | "threshold" | "direction">
  ) => void;
}) {
  const t = useTranslations("landscape.layers");
  const [kind, setKind] = useState<LayerKind>("time");
  const byTask = kind === "time" || kind === "reach";
  const options = byTask
    ? tasks.map((task) => ({ value: task, text: task }))
    : labels.map((l) => ({ value: l.key, text: labelName(l) }));
  const [pick, setPick] = useState("");
  const chosen = options.some((o) => o.value === pick)
    ? pick
    : (options[0]?.value ?? "");

  return (
    <div className="max-w-md space-y-2 rounded-[var(--radius-control)] bg-surface-2 p-3">
      <p className="text-[13px] font-medium text-ink-2">{t("add")}</p>
      <Select
        aria-label={t("kind")}
        value={kind}
        onChange={(e) => setKind(e.target.value as LayerKind)}
        className="h-9 text-[14px]"
      >
        {LAYER_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`kinds.${k}`)}
          </option>
        ))}
      </Select>
      <p className="type-caption text-ink-3">{t(`explain.${kind}`)}</p>
      {options.length === 0 ? (
        <p className={cn("type-caption text-ink-3")}>
          {byTask ? t("noTasks") : t("noLabels")}
        </p>
      ) : (
        <>
          <Select
            aria-label={byTask ? t("task") : t("label")}
            value={chosen}
            onChange={(e) => setPick(e.target.value)}
            className="h-9 text-[14px]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            onClick={() => {
              const label = labels.find((l) => l.key === chosen);
              onAdd({
                kind,
                ...(byTask ? { task: chosen } : { label: chosen }),
                ...(kind === "threshold" && label
                  ? {
                      threshold: defaultThreshold(label),
                      direction: "above" as const,
                    }
                  : {}),
              });
            }}
          >
            {t("addButton")}
          </Button>
        </>
      )}
    </div>
  );
}
