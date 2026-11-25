/**
 * The Learning section's modules, in the order a class takes them.
 *
 * A module is ready when it has steps; one without is listed as coming soon, so the
 * section shows the whole course from the first day. Names and blurbs are in
 * `messages/*.json` under `learning.modules.<key>`.
 */
import { ENCODING, type Step } from "@/lib/learning/encoding";

/** A module's key in `learning.modules`. */
export type ModuleKey = "neuralNetworks" | "encoding" | "plasticity";

export interface LearningModule {
  slug: string;
  key: ModuleKey;
  /** Empty until the module is written. */
  steps: Step[];
}

export const MODULES: LearningModule[] = [
  { slug: "neural-networks", key: "neuralNetworks", steps: [] },
  { slug: "encoding", key: "encoding", steps: ENCODING },
  { slug: "brain-plasticity", key: "plasticity", steps: [] },
];

/** The module at `slug`, or null. */
export function moduleOf(slug: string): LearningModule | null {
  return MODULES.find((m) => m.slug === slug) ?? null;
}

/**
 * The step to show for a `?step=` value: 1-based in the address (what a teacher reads
 * out: "go to step 7"), 0-based here, clamped to the module.
 */
export function stepIndex(raw: string | null, count: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || count === 0) return 0;
  return Math.min(Math.max(n - 1, 0), count - 1);
}
