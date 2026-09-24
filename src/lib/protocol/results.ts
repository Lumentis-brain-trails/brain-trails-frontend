/**
 * What to call each step's results on the screen that closes a run.
 *
 * A step id is the builder's, not the author's: it is made from the kind in the order
 * blocks were added (`go_no_go`, then `go_no_go-2`), so two blocks of one kind read in the
 * order they were dropped on the timeline, not the order they ran. The plan's label is
 * the name the author gave the block.
 */

import type { ProtocolDefinition, TaskResult } from "./types";

/**
 * A title per result, keyed by `stepId`: the step's label in `plan`, falling back to its
 * id. Results that share a label are numbered in the order they ran - "Signal Navigator
 * (1)", "Signal Navigator (2)" - so two runs of one game are told apart by position.
 */
export function resultTitles(
  results: readonly TaskResult[],
  plan: ProtocolDefinition | null
): Record<string, string> {
  const labels = new Map(
    (plan?.steps ?? []).map((step) => [step.id, step.label])
  );
  const labelOf = (result: TaskResult) =>
    labels.get(result.stepId) || result.stepId;

  const total = new Map<string, number>();
  for (const result of results) {
    const label = labelOf(result);
    total.set(label, (total.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const titles: Record<string, string> = {};
  for (const result of results) {
    const label = labelOf(result);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    titles[result.stepId] =
      (total.get(label) ?? 0) > 1 ? `${label} (${n})` : label;
  }
  return titles;
}
