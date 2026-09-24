/**
 * Narrowing a block before comparing it: a stretch of time, some trial labels.
 *
 * A column's focus is a range inside its block and, for a task block, the labels to keep.
 * The backend recomputes every metric for it (`GET /recordings/{id}/selection`, backend
 * V3-0017); this module holds what the page needs around that call: the query, which
 * windows the focus keeps (to light them on the trail), and the block the metric rows read
 * - the stored row with the selection's numbers laid over it.
 *
 * The average person (`norm`) is kept only for the whole block: an average over whole
 * blocks says nothing about one person's docked cargo between minute one and two.
 */
import type { components } from "@/lib/api-types";
import type { BlockMetrics } from "@/lib/compare/rows";

export type Selection = components["schemas"]["SelectionOut"];

export interface Focus {
  /** Session seconds; null is the whole block. */
  range: [number, number] | null;
  /** Labels to keep; null keeps every window and trial. */
  labels: readonly string[] | null;
}

export const WHOLE_BLOCK: Focus = { range: null, labels: null };

type Span = Pick<BlockMetrics, "t_start_s" | "t_end_s">;

/** The focus's range, or the block's own bounds. */
export function focusRange(block: Span, focus: Focus): [number, number] {
  return focus.range ?? [block.t_start_s, block.t_end_s];
}

/** Whether the focus narrows the block at all. */
export function isNarrowed(block: Span, focus: Focus): boolean {
  const [a, b] = focusRange(block, focus);
  return a > block.t_start_s || b < block.t_end_s || focus.labels !== null;
}

/** The query string of the selection request for `block` under `focus`. */
export function selectionQuery(blockKey: string, focus: Focus): string {
  const params = new URLSearchParams({ block: blockKey });
  if (focus.range) {
    params.set("start", String(focus.range[0]));
    params.set("end", String(focus.range[1]));
  }
  for (const label of focus.labels ?? []) params.append("labels", label);
  return params.toString();
}

/**
 * Which of the block's windows the focus keeps: start inside the range (half-open, as
 * the backend cuts them) and, with labels, a label among them - an unlabelled window is
 * left out by a label filter, as the backend leaves it out.
 */
export function keptWindows(
  windowT: readonly number[],
  windowLabels: readonly (string | null)[] | null | undefined,
  block: Span,
  focus: Focus
): boolean[] {
  const [a, b] = focusRange(block, focus);
  const wanted = focus.labels ? new Set(focus.labels) : null;
  return windowT.map((t, i) => {
    if (t < a || t >= b) return false;
    if (!wanted || !windowLabels) return true;
    const label = windowLabels[i];
    return label !== null && label !== undefined && wanted.has(label);
  });
}

/**
 * The block the metric rows read: the stored row, with the selection's recomputed
 * numbers over it once they arrive. Its time bounds are the focus's, so a band's line
 * is drawn over the selected stretch only.
 */
export function focusedBlock(
  row: BlockMetrics,
  focus: Focus,
  selection: Selection | undefined
): BlockMetrics {
  const [a, b] = focusRange(row, focus);
  const narrowed = isNarrowed(row, focus);
  return {
    ...row,
    t_start_s: a,
    t_end_s: b,
    ...(selection
      ? {
          bands: selection.bands,
          dynamics: selection.dynamics ?? null,
          behaviour: selection.behaviour ?? null,
          labels: selection.window_labels ?? row.labels,
        }
      : {}),
    norm: narrowed ? null : row.norm,
  } as BlockMetrics;
}

/** Toggle one label in a focus; every label on again means no label filter. */
export function toggleLabel(
  focus: Focus,
  label: string,
  available: readonly string[]
): Focus {
  const current = new Set(focus.labels ?? available);
  if (current.has(label)) current.delete(label);
  else current.add(label);
  const labels = available.filter((l) => current.has(l));
  return {
    ...focus,
    labels: labels.length === available.length ? null : labels,
  };
}
