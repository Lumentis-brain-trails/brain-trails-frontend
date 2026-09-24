/**
 * The Task and Protocol contract.
 *
 * A **task** is one self-contained thing that runs for a while and emits a stream of
 * markers. A **protocol** is an ordered juxtaposition of tasks and prompts. Task *kinds*
 * are code - a renderer plus a config schema, registered by name. Protocols are data, so
 * a new protocol is a new object and not a new component.
 *
 * This mirrors decision V2-0002's stimulus contract (manifest, lifecycle, event stream,
 * deterministic seed) at the granularity of a single protocol step.
 */

import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { MarkerDraft, MarkerMeta } from "./marker";
import type { TrialRecord } from "./metrics";

/**
 * Report that something happened.
 *
 * `atHostMs` lets a task offer the timestamp it actually observed - a rAF frame time or
 * an input event's `timeStamp` - rather than the moment the handler happened to run. The
 * runner converts it; a task never reads a clock itself (decision V2-0002).
 */
export type Emit = (draft: MarkerDraft, atHostMs?: number) => void;

export interface TaskResult {
  stepId: string;
  taskKind: string;
  /** Merged into the session summary at finish. */
  summary: Record<string, unknown>;
  /** Trial-level rows for the game kinds; absent for prompts and video. */
  trials?: TrialRecord[];
}

export interface TaskContext<C = unknown> {
  config: C;
  stepId: string;
  phase: string;
  /** Derived per step, so reordering steps cannot change a block's sequence. */
  seed: number;
  emit: Emit;
  onComplete: (result: TaskResult) => void;
  /** True when the participant asked for less motion, or the OS did. */
  reducedMotion: boolean;
}

export interface TaskKind<C = unknown> {
  name: string;
  configSchema: ZodType<C>;
  Renderer: ComponentType<TaskContext<C>>;
  /** Shows the motion notice before this step runs. */
  motionSensitive?: boolean;
}

export interface ProtocolStep {
  /** Stable id; appears in every marker this step produces. */
  id: string;
  /** Registry key of the task kind. */
  kind: string;
  /** User-facing stage label. */
  label: string;
  /** The spec's `phase` field; defaults to `id`. */
  phase?: string;
  /** Emitted on entry, e.g. "challenge_a_start". */
  startMarker?: string;
  /** Emitted on completion, e.g. "challenge_a_end". */
  endMarker?: string;
  config: unknown;
  /**
   * Where this step came from in the protocol tree, set by `resolvePlan` on the step a
   * block produced (not on the fixation or rest it inserts around it). The runner
   * brackets such a step with `block_start`/`block_end` and stamps these fields onto
   * every marker of the step, which is what per-block analysis and BIDS read.
   */
  block?: StepBlock;
}

/** Provenance of a resolved step (backend decision V3-0004, "Events"). */
export interface StepBlock {
  /** The block node's id in the tree; shared by every loop copy. */
  block_id: string;
  /** Slash-joined node ids (or child indices) from the root to the block. */
  node_path: string;
  /** Position in the innermost enclosing loop's presentation order; null outside loops. */
  iteration: number | null;
  /** The block's condition after `$var` substitution; BIDS `trial_type`. */
  condition?: string;
}

/**
 * A soundtrack cue as the runner needs it: anchors resolved to step indices (V3-0014).
 *
 * `startStep` null is the start of the protocol. A stop at a step fires as that step
 * completes; `protocol_end` fires when the run ends; `clip_end` leaves it to the file.
 * `src` is set by `bindMedia`, exactly as a block's is.
 */
export interface PlannedCue {
  id: string;
  label?: string;
  media_id: string;
  src?: string;
  startStep: number | null;
  offsetS: number;
  stop:
    | { kind: "clip_end" }
    | { kind: "protocol_end" }
    | { kind: "step"; step: number };
  loop: boolean;
  volume: number;
  fadeS: number;
}

export interface ProtocolDefinition {
  id: string;
  version: number;
  title: string;
  /** Sounds that play over the steps rather than taking a turn; absent for most plans. */
  soundtrack?: PlannedCue[];
  /** Honoured by the host as a notice before the run (decision V2-0002). */
  contentWarning?: string;
  startMarker?: string;
  endMarker?: string;
  steps: ProtocolStep[];
}

/**
 * Provenance stamped onto every marker of a step: the protocol and step, plus, for a
 * step resolved from a tree block, the block fields analysis groups by (V3-0004).
 */
export function protocolMeta(
  protocol: ProtocolDefinition,
  step: ProtocolStep
): MarkerMeta {
  return {
    protocol_id: protocol.id,
    protocol_version: protocol.version,
    step_id: step.id,
    task_kind: step.kind,
    phase: step.phase ?? step.id,
    ...(step.block
      ? {
          block_id: step.block.block_id,
          node_path: step.block.node_path,
          iteration: step.block.iteration,
          ...(step.block.condition !== undefined
            ? { condition: step.block.condition }
            : {}),
        }
      : {}),
  };
}
