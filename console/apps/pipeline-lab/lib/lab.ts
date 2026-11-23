import type {
  LabExperiment,
  LabLabelSource,
  LabMetric,
  LabOptions,
  LabResult,
  LabRunStatus,
} from "@console/lib/client";

/**
 * The Pipeline lab's pure helpers (backend OPS-0006): the form's state and its
 * experiment, the values a label source offers, the run's polling, the scatter's
 * geometry and colours. Pages draw; this module decides.
 */

export const LABEL_SOURCES: readonly LabLabelSource[] = [
  "block_kind",
  "block_label",
  "trial",
  "task_label",
  "context",
];

export const METRICS: readonly LabMetric[] = [
  "entropy",
  "recurrence",
  "diameter",
  "stretching",
  "modularity",
];

type Filters = NonNullable<LabExperiment["filters"]>;
/** An age band, as the backend names them (`<18`, `18-24`, ...). */
export type AgeBand = NonNullable<Filters["age_band"]>;

/** How often an unfinished run is read again; the reads hit `braintrails_ops` only. */
export const POLL_MS = 3000;

/** Below this many people, an A/B score is a hint, not a result (backend FEW_PEOPLE). */
export const FEW_PEOPLE = 10;

/** The form, as strings and flags; `toExperiment` turns it into the request. */
export interface LabForm {
  title: string;
  kind: "explore" | "ab";
  /** Empty: an exploration drawn in one colour. */
  label: LabLabelSource | "";
  contextItem: string;
  a: string;
  b: string;
  protocolId: string;
  blockKind: string;
  blockLabel: string;
  ageBand: string;
  sex: string;
  device: string;
  dateFrom: string;
  dateTo: string;
  minQuality: "" | "usable" | "good";
  researchOnly: boolean;
  maxRecordings: number;
  method: "pca" | "tsne";
  perplexity: number;
  /** Empty: the radius is chosen for a legible cover. */
  eps: string;
  metrics: LabMetric[];
}

export function defaultForm(): LabForm {
  return {
    title: "",
    kind: "explore",
    label: "",
    contextItem: "",
    a: "",
    b: "",
    protocolId: "",
    blockKind: "",
    blockLabel: "",
    ageBand: "",
    sex: "",
    device: "",
    dateFrom: "",
    dateTo: "",
    minQuality: "",
    researchOnly: true,
    maxRecordings: 50,
    method: "pca",
    perplexity: 30,
    eps: "",
    metrics: [...METRICS],
  };
}

/** What is wrong with the form, as message keys; empty when it can be sent. */
export type Problem =
  | "title"
  | "label"
  | "contextItem"
  | "values"
  | "sameValues"
  | "dates"
  | "eps"
  | "perplexity"
  | "maxRecordings"
  | "metrics";

export function problems(form: LabForm, maxRecordings = 200): Problem[] {
  const out: Problem[] = [];
  if (!form.title.trim()) out.push("title");
  if (form.kind === "ab" && !form.label) out.push("label");
  if (form.label === "context" && !form.contextItem) out.push("contextItem");
  if (form.kind === "ab") {
    if (!form.a || !form.b) out.push("values");
    else if (form.a === form.b) out.push("sameValues");
  }
  if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo)
    out.push("dates");
  if (form.eps.trim()) {
    const eps = Number(form.eps);
    if (!Number.isFinite(eps) || eps <= 0) out.push("eps");
  }
  if (
    form.method === "tsne" &&
    !(form.perplexity >= 5 && form.perplexity <= 100)
  )
    out.push("perplexity");
  if (
    !Number.isInteger(form.maxRecordings) ||
    form.maxRecordings < 1 ||
    form.maxRecordings > maxRecordings
  )
    out.push("maxRecordings");
  if (form.metrics.length === 0) out.push("metrics");
  return out;
}

const orNull = (value: string): string | null => value.trim() || null;

/** The request for a valid form; the phase-2 steps are always `standard`. */
export function toExperiment(form: LabForm): LabExperiment {
  const label = form.label || null;
  const ab = form.kind === "ab";
  return {
    title: form.title.trim(),
    question: {
      kind: form.kind,
      label,
      context_item: label === "context" ? orNull(form.contextItem) : null,
      a: ab ? orNull(form.a) : null,
      b: ab ? orNull(form.b) : null,
    },
    filters: {
      protocol_id: orNull(form.protocolId),
      block_kind: orNull(form.blockKind),
      block_label: orNull(form.blockLabel),
      age_band: orNull(form.ageBand) as AgeBand | null,
      sex: orNull(form.sex),
      device: orNull(form.device),
      date_from: orNull(form.dateFrom),
      date_to: orNull(form.dateTo),
      min_quality: form.minQuality || null,
      research_consent_only: form.researchOnly,
      max_recordings: form.maxRecordings,
    },
    preprocessing: "standard",
    artefacts: "standard",
    encoding: "standard",
    reduction: { method: form.method, perplexity: form.perplexity },
    graph: { eps: form.eps.trim() ? Number(form.eps) : null },
    metrics: METRICS.filter((m) => form.metrics.includes(m)),
  };
}

/** A stored experiment back in the form, to edit a copy of it. */
export function fromExperiment(config: LabExperiment): LabForm {
  const base = defaultForm();
  const q = config.question;
  const f = config.filters;
  return {
    ...base,
    title: config.title,
    kind: q?.kind ?? "explore",
    label: q?.label ?? "",
    contextItem: q?.context_item ?? "",
    a: q?.a ?? "",
    b: q?.b ?? "",
    protocolId: f?.protocol_id ?? "",
    blockKind: f?.block_kind ?? "",
    blockLabel: f?.block_label ?? "",
    ageBand: f?.age_band ?? "",
    sex: f?.sex ?? "",
    device: f?.device ?? "",
    dateFrom: f?.date_from ?? "",
    dateTo: f?.date_to ?? "",
    minQuality: f?.min_quality ?? "",
    researchOnly: f?.research_consent_only ?? true,
    maxRecordings: f?.max_recordings ?? base.maxRecordings,
    method: config.reduction?.method ?? "pca",
    perplexity: config.reduction?.perplexity ?? base.perplexity,
    eps:
      config.graph?.eps === null || config.graph?.eps === undefined
        ? ""
        : String(config.graph.eps),
    metrics: config.metrics?.length ? [...config.metrics] : [...METRICS],
  };
}

export type Option = LabOptions["protocols"][number];

/** The values a label source offers on this environment, for A and B. */
export function labelValues(
  options: LabOptions,
  source: LabLabelSource | "",
  contextItem: string
): Option[] {
  switch (source) {
    case "block_kind":
      return options.block_kinds;
    case "block_label":
      return options.block_labels;
    case "trial":
      return options.trial_labels;
    case "task_label":
      return options.task_labels;
    case "context":
      return (
        options.context_items.find((c) => c.key === contextItem)?.values ?? []
      );
    default:
      return [];
  }
}

/** Whether a run is still waiting for the worker. */
export function isActive(status: LabRunStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

/** react-query's `refetchInterval`: every 3 s while the run is unfinished, then never. */
export function pollInterval(status: LabRunStatus | undefined): number | false {
  return isActive(status) ? POLL_MS : false;
}

/** A stored run error (`<code>: <message>`) split; a bare text is a `failed`. */
export function runError(
  error: string | null
): { code: string; message: string } | null {
  if (!error) return null;
  const match = /^([a-z_]+): ?([\s\S]*)$/.exec(error);
  if (!match) return { code: "failed", message: error };
  return { code: match[1], message: match[2] };
}

/** The run errors the console words itself; any other code reads as `failed`. */
export const RUN_ERRORS = [
  "lab_unavailable",
  "no_recordings",
  "no_windows",
  "too_few_windows",
  "eps_too_small",
  "time_limit",
  "interrupted",
  "failed",
] as const;
export type RunErrorCode = (typeof RUN_ERRORS)[number];

export function runErrorCode(code: string): RunErrorCode {
  return (RUN_ERRORS as readonly string[]).includes(code)
    ? (code as RunErrorCode)
    : "failed";
}

/**
 * Twelve label colours (backend MAX_LABELS), legible on the light and the dark ground;
 * the first four are the trail's. `other` and unlabelled windows are grey.
 */
export const PALETTE = [
  "#e8a02a",
  "#1bafc4",
  "#7c5ce6",
  "#e2569c",
  "#3f9b55",
  "#d4572c",
  "#3b74d9",
  "#a8872a",
  "#2a9d8f",
  "#b04fc4",
  "#c43b52",
  "#6f8f2e",
] as const;
export const GREY = "#8a8f98";

/** The colour of label `index` in `labels`; -1 (no label) and `other` are grey. */
export function colourOf(labels: readonly string[], index: number): string {
  if (index < 0 || index >= labels.length || labels[index] === "other")
    return GREY;
  return PALETTE[index % PALETTE.length];
}

/** The colour of a label by name, as the scatter draws it. */
export function colourFor(labels: readonly string[], label: string): string {
  return colourOf(labels, labels.indexOf(label));
}

/** A linear map of `values` onto [pad, size - pad]; a flat axis sits in the middle. */
export function fit(values: readonly number[], size: number, pad: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  return (v: number) =>
    !Number.isFinite(span) || span === 0
      ? size / 2
      : pad + ((v - lo) / span) * (size - 2 * pad);
}

export type Points = LabResult["points"];

/** The scatter's points in an SVG box, y up; unlabelled first so labels draw on top. */
export function scatter(points: Points, width: number, height: number) {
  const pad = 8;
  const sx = fit(points.x, width, pad);
  const syRaw = fit(points.y, height, pad);
  const order = points.x
    .map((_, i) => i)
    .sort(
      (i, j) => Number(points.label[i] >= 0) - Number(points.label[j] >= 0)
    );
  return order.map((i) => ({
    x: sx(points.x[i]),
    y: height - syRaw(points.y[i]),
    colour: colourOf(points.labels, points.label[i]),
    labelled: points.label[i] >= 0,
  }));
}

/** An AUC as the result shows it: two decimals, a dash when there is none. */
export function auc(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : value.toFixed(2);
}

/** A metric value: three significant digits, a dash when it could not be measured. */
export function metric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "–";
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toPrecision(3);
}

/** Whether a classifier's people are too few for its score to mean much. */
export function fewPeople(
  classifier: LabResult["classifier"] | undefined
): boolean {
  if (!classifier) return false;
  return (
    classifier.warnings?.includes("few_people") === true ||
    classifier.n_people < FEW_PEOPLE
  );
}

/** The graph's node with the most windows of a label, as the node's colour. */
export function dominant(
  labels: Record<string, number>,
  shown: readonly string[]
): string {
  let best: string | null = null;
  let most = 0;
  for (const [label, n] of Object.entries(labels)) {
    if (n > most) {
      best = label;
      most = n;
    }
  }
  return best === null ? GREY : colourFor(shown, best);
}
