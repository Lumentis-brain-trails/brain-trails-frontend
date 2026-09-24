/**
 * The rows a reader can add under the two blocks being compared.
 *
 * Every row is one number per block, read off the backend's block row (`/blocks`), and
 * drawn on one scale shared by both columns so the two bars can be compared by eye. The
 * catalogue is deliberately short - four band powers, five dynamics, five task scores -
 * because the page it replaces showed everything it had and meant little.
 *
 * Nothing here decides a verdict: a row shows two values (and, for task rows, the
 * average person), never "better" or "worse".
 */
import type { components } from "@/lib/api-types";

export type BlockMetrics = components["schemas"]["BlockMetricsOut"];
type Norm = components["schemas"]["BlockNormOut"];

export type RowGroup = "spectral" | "dynamics" | "task";

export type RowId =
  | "alpha"
  | "beta"
  | "theta"
  | "delta"
  | "entropy"
  | "recurrence"
  | "modularity"
  | "diameter"
  | "stretching"
  | "accuracy"
  | "reaction_time"
  | "rt_spread"
  | "hit_rate"
  | "false_alarms";

/** How a value is written: a share, milliseconds, bits, a plain ratio, ball radii. */
export type Format = "percent" | "ms" | "bits" | "ratio" | "radii";

/** Why a block has no value on a row, so the cell can say so instead of a bare dash. */
export type Missing = "short" | "not_task" | "no_labels" | "not_ready";

export interface RowSpec {
  id: RowId;
  group: RowGroup;
  format: Format;
  /** Fixed ends of the scale; null means fit to the values on screen. */
  domain: [number, number] | null;
  value: (block: BlockMetrics) => number | null;
  /** The average person's value, for task rows. */
  norm?: (norm: Norm) => number | null;
}

const band =
  (name: string) =>
  (block: BlockMetrics): number | null =>
    block.bands?.[name] ?? null;

const dynamic =
  (name: "entropy" | "recurrence" | "modularity" | "diameter" | "stretching") =>
  (block: BlockMetrics): number | null =>
    block.dynamics?.[name] ?? null;

export const ROWS: readonly RowSpec[] = [
  {
    id: "alpha",
    group: "spectral",
    format: "percent",
    domain: [0, 1],
    value: band("alpha"),
  },
  {
    id: "beta",
    group: "spectral",
    format: "percent",
    domain: [0, 1],
    value: band("beta"),
  },
  {
    id: "theta",
    group: "spectral",
    format: "percent",
    domain: [0, 1],
    value: band("theta"),
  },
  {
    id: "delta",
    group: "spectral",
    format: "percent",
    domain: [0, 1],
    value: band("delta"),
  },
  {
    id: "entropy",
    group: "dynamics",
    format: "bits",
    domain: null,
    value: dynamic("entropy"),
  },
  {
    id: "recurrence",
    group: "dynamics",
    format: "percent",
    domain: [0, 1],
    value: dynamic("recurrence"),
  },
  {
    id: "modularity",
    group: "dynamics",
    format: "ratio",
    domain: [0, 1],
    value: dynamic("modularity"),
  },
  {
    id: "diameter",
    group: "dynamics",
    format: "radii",
    domain: null,
    value: dynamic("diameter"),
  },
  {
    id: "stretching",
    group: "dynamics",
    format: "ratio",
    domain: [0, 1],
    value: dynamic("stretching"),
  },
  {
    id: "accuracy",
    group: "task",
    format: "percent",
    domain: [0, 1],
    value: (b) => b.behaviour?.accuracy ?? null,
    norm: (n) => n.accuracy ?? null,
  },
  {
    id: "reaction_time",
    group: "task",
    format: "ms",
    domain: null,
    value: (b) => b.behaviour?.rt?.median_ms ?? null,
    norm: (n) => n.median_rt_ms ?? null,
  },
  {
    id: "rt_spread",
    group: "task",
    format: "ms",
    domain: null,
    value: (b) => b.behaviour?.rt?.mad_ms ?? null,
    norm: (n) => n.rt_mad_ms ?? null,
  },
  {
    id: "hit_rate",
    group: "task",
    format: "percent",
    domain: [0, 1],
    value: (b) => b.behaviour?.hit_rate ?? null,
    norm: (n) => n.hit_rate ?? null,
  },
  {
    id: "false_alarms",
    group: "task",
    format: "percent",
    domain: [0, 1],
    value: (b) => b.behaviour?.commission_rate ?? null,
    norm: (n) => n.commission_rate ?? null,
  },
];

export const ROW_GROUPS: readonly RowGroup[] = ["spectral", "dynamics", "task"];

/** What a first visit shows under the trail and the frame. */
export const DEFAULT_ROWS: readonly RowId[] = ["alpha", "entropy", "accuracy"];

export function rowSpec(id: RowId): RowSpec {
  const spec = ROWS.find((r) => r.id === id);
  if (!spec) throw new Error(`unknown row ${id}`);
  return spec;
}

/** Why `block` has no value on `spec`, when it has none. */
export function missingReason(spec: RowSpec, block: BlockMetrics): Missing {
  if (spec.group === "task") return "not_task";
  if (spec.group === "spectral") return "not_ready";
  if (!block.dynamics) return "not_ready";
  if (spec.id === "modularity" && !block.labels) return "no_labels";
  return "short";
}

/**
 * The scale both cells of a row share: the row's fixed domain, or zero to a little past
 * the largest value on screen (the average person's included), so neither bar touches
 * the end and a zero is never a missing bar.
 */
export function sharedDomain(
  spec: RowSpec,
  values: readonly (number | null | undefined)[]
): [number, number] {
  if (spec.domain) return spec.domain;
  const top = Math.max(
    0,
    ...values.filter((v): v is number => typeof v === "number")
  );
  return [0, top > 0 ? top * 1.15 : 1];
}

/** Where `value` falls on `domain`, clamped to 0..1. */
export function position(value: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** The number as a cell writes it; the unit word comes from the messages. */
export function formatValue(format: Format, value: number): string {
  switch (format) {
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "ms":
      return `${Math.round(value)} ms`;
    case "bits":
      return value.toFixed(2);
    case "radii":
      return value.toFixed(1);
    case "ratio":
      return value.toFixed(2);
  }
}

/** Which of two values on a row is larger, as the reader sees them. */
export type Direction = "higher" | "lower" | "same";

/** The value in the unit a cell writes it, rounded as it is written. */
function shown(format: Format, value: number): number {
  switch (format) {
    case "percent":
      return Math.round(value * 100);
    case "ms":
      return Math.round(value);
    case "bits":
    case "ratio":
      return Math.round(value * 100);
    case "radii":
      return Math.round(value * 10);
  }
}

/**
 * Whether `value` is higher or lower than `other`, compared at the precision the cells
 * show: two cells that both read "22%" are the same to the reader, and colouring one of
 * them blue over a difference nobody can see would be a claim the page cannot back.
 * Null when either side has no value.
 */
export function direction(
  format: Format,
  value: number | null,
  other: number | null
): Direction | null {
  if (value === null || other === null) return null;
  const a = shown(format, value);
  const b = shown(format, other);
  return a > b ? "higher" : a < b ? "lower" : "same";
}

/** Storage key of the rows a reader chose; a convenience, never state that matters. */
export const ROWS_STORAGE_KEY = "bt-compare-rows";

/** The reader's rows from a previous visit, or the defaults. */
export function readRows(): RowId[] {
  try {
    const raw = window.localStorage.getItem(ROWS_STORAGE_KEY);
    if (raw) {
      const ids = (JSON.parse(raw) as unknown[]).filter(
        (id): id is RowId =>
          typeof id === "string" && ROWS.some((r) => r.id === id)
      );
      return ids;
    }
  } catch {
    // unreadable or blocked storage: the defaults are a fine first view
  }
  return [...DEFAULT_ROWS];
}

export function writeRows(rows: readonly RowId[]): void {
  try {
    window.localStorage.setItem(ROWS_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // blocked storage: the choice lasts for this page only
  }
}
