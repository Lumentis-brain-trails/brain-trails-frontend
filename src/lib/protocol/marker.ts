/**
 * The canonical marker: one record that satisfies the task spec, decision V1-0001
 * (timing model) and the shipped `{t, type, payload}` wire format at once.
 *
 * A task never builds a marker itself - it describes what happened and the runner
 * stamps the time, per decision V2-0002 ("the host stamps `t`, the stimulus never
 * reads a clock"). That is what keeps timing trustworthy across a paused tab and,
 * later, across an iframe boundary.
 */

/** Coarse family of a marker, so analysis can group without parsing labels. */
export type MarkerKind =
  | "system" // session_start, session_end, run_aborted, visibility_*
  | "stage" // *_start / *_end of a protocol step
  | "instruction"
  | "stimulus" // cue onset, target onset, image onset, breath phase
  | "response"
  | "outcome";

export type Outcome = "hit" | "miss" | "correct_rejection" | "commission_error";

/** Everything the spec names per event, plus what the runner adds for provenance. */
export interface MarkerMeta {
  protocol_id?: string;
  protocol_version?: number;
  step_id?: string;
  task_kind?: string;
  phase?: string;
  trial_id?: number;
  practice?: boolean;
  cue?: "green" | "red";
  stimulus_class?: "cargo" | "debris";
  stimulus_id?: string;
  required_action?: "press" | "withhold";
  response_type?: "dock_press";
  reaction_time_ms?: number;
  outcome?: Outcome;
  /** Protocol-relative onset the schedule asked for. */
  planned_onset_ms?: number;
  /** Protocol-relative onset the frame actually landed on. */
  actual_onset_ms?: number;
  /** actual - planned, precomputed so no reader has to re-derive it. */
  onset_error_ms?: number;
  /** Set when the frame that carried this event arrived more than two frames late. */
  late_frame?: boolean;
  /** Set when the trial straddled a hidden tab and must be excluded from rates. */
  invalid?: boolean;
  motion_profile?: "full" | "reduced";
  [key: string]: unknown;
}

/** One marker, host-stamped. */
export interface Marker {
  /** Spec: `event_name`. ADR: `label`. Wire: `type`. */
  label: string;
  kind: MarkerKind;
  /** ADR: `t_session_s`. Null until an EEG clock anchor exists. */
  tSessionS: number | null;
  /** Spec: `timestamp_monotonic_ms`. Raw `performance.now()`, never null. */
  tMonotonicMs: number;
  /** Milliseconds since protocol start; the fallback axis when `tSessionS` is null. */
  tRunMs: number;
  /**
   * The runner's own counter. With `t` and `type` it identifies the marker, so the
   * backend stores it once when a batch is sent live and again at finish (V3-0005).
   */
  seq?: number;
  meta: MarkerMeta;
}

/** What a task hands the runner. The runner supplies everything else. */
export interface MarkerDraft {
  label: string;
  kind: MarkerKind;
  meta?: MarkerMeta;
}

/** The wire shape of `POST /sessions/{id}/events`. */
export interface WireEvent {
  t: number;
  type: string;
  payload: Record<string, unknown>;
  seq?: number;
}

/** Hard limits from the sessions endpoint; the sink must respect them. */
export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_PAYLOAD_BYTES = 4096;

/**
 * Map a marker onto the wire format.
 *
 * `t` falls back to the run clock when no EEG anchor exists, and `t_session_estimated`
 * records that it did - without that flag the JSONL would silently claim EEG alignment
 * it does not have. `t` is clamped at 0 because the endpoint rejects negatives.
 */
export function toWireEvent(m: Marker): WireEvent {
  const t = m.tSessionS ?? m.tRunMs / 1000;
  return {
    t: Math.max(0, t),
    type: m.label,
    ...(m.seq !== undefined ? { seq: m.seq } : {}),
    payload: {
      kind: m.kind,
      t_monotonic_ms: m.tMonotonicMs,
      t_run_ms: m.tRunMs,
      t_session_estimated: m.tSessionS === null,
      ...m.meta,
    },
  };
}

/** Byte length of a wire event once serialized, for the per-event size cap. */
export function wireEventBytes(e: WireEvent): number {
  return new TextEncoder().encode(JSON.stringify(e)).length;
}
