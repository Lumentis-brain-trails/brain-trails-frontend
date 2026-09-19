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
}

export interface ProtocolDefinition {
  id: string;
  version: number;
  title: string;
  /** Honoured by the host as a notice before the run (decision V2-0002). */
  contentWarning?: string;
  startMarker?: string;
  endMarker?: string;
  steps: ProtocolStep[];
}

/** Provenance stamped onto every marker of a run. */
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
  };
}
