/**
 * What was on screen at a moment of a session, rebuilt from its timeline.
 *
 * Nothing records the screen. A go/no-go block does not need it: every trial's markers
 * say when the beacon came on and in which colour, when the object entered and what it
 * was, and how the trial ended - which is everything the task's own painter
 * (`kinds/render.ts`) draws. So the frame row repaints the task from a `Scene` rebuilt
 * here, with the same code that painted it the first time.
 *
 * The object's position is estimated: the timeline has the target onset and the outcome
 * (stamped when the response window closed), not the travel time, so the object is
 * placed by how far `t` is between the two. A video block is not rebuilt here - the page
 * seeks the video itself (`review/timeline.ts`).
 */
import type { Scene } from "@/lib/protocol/engine";
import type { Outcome, WireEvent } from "@/lib/protocol/marker";

/** One trial of a go/no-go block, on the session clock. */
export interface TrialTrack {
  trialId: number;
  /** Beacon onset, for a cued trial. */
  tCue: number | null;
  cue: "green" | "red" | null;
  tTarget: number;
  objectClass: "cargo" | "debris";
  tOutcome: number;
  outcome: Outcome;
}

const OUTCOMES = new Set<string>([
  "hit",
  "miss",
  "correct_rejection",
  "commission_error",
  "error",
]);

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The go/no-go trials between `tStart` and `tEnd`, in order.
 *
 * Mirrors the backend's `trials_from_events`: a trial exists once its outcome does,
 * its target is the last stimulus marker before the outcome and its cue the first (when
 * there are two). A trial cut off before its outcome is left out.
 */
export function trialsOf(
  events: readonly WireEvent[],
  tStart: number,
  tEnd: number
): TrialTrack[] {
  const onsets = new Map<
    number,
    { t: number; payload: WireEvent["payload"] }[]
  >();
  const out: TrialTrack[] = [];
  for (const event of events) {
    if (event.t < tStart || event.t > tEnd) continue;
    const id = num(event.payload.trial_id);
    if (id === null) continue;
    const kind = event.payload.kind;
    if (kind === "stimulus") {
      const list = onsets.get(id) ?? [];
      list.push({ t: event.t, payload: event.payload });
      onsets.set(id, list);
    } else if (kind === "outcome") {
      const outcome = event.payload.outcome;
      const seen = onsets.get(id) ?? [];
      onsets.delete(id);
      const target = seen.at(-1);
      const cue = seen.length > 1 ? seen[0] : null;
      const objectClass =
        event.payload.stimulus_class ?? target?.payload.stimulus_class;
      if (
        typeof outcome !== "string" ||
        !OUTCOMES.has(outcome) ||
        (objectClass !== "cargo" && objectClass !== "debris")
      )
        continue;
      const cueColour = event.payload.cue ?? cue?.payload.cue;
      out.push({
        trialId: id,
        tCue: cue?.t ?? null,
        cue: cueColour === "green" || cueColour === "red" ? cueColour : null,
        tTarget: target?.t ?? event.t,
        objectClass,
        tOutcome: event.t,
        outcome: outcome as Outcome,
      });
    }
  }
  return out;
}

/** How long the last outcome stays on screen as feedback, in seconds. */
const FEEDBACK_S = 0.6;

/**
 * The scene at session time `t`: the trial whose cue or target is on screen, or the
 * feedback of the one that just ended, or an empty stage between trials.
 */
export function sceneAt(tracks: readonly TrialTrack[], t: number): Scene {
  const empty: Scene = {
    phase: "iti",
    beacon: null,
    objectClass: null,
    objectProgress: null,
    feedback: null,
    trialIndex: 0,
    totalTrials: tracks.length,
  };
  if (tracks.length === 0) return { ...empty, phase: "pending" };
  for (let i = 0; i < tracks.length; i += 1) {
    const trial = tracks[i];
    const start = trial.tCue ?? trial.tTarget;
    if (t < start) return { ...empty, trialIndex: i };
    if (t < trial.tTarget)
      return {
        ...empty,
        phase: t < start + 0.4 ? "cue" : "cue_delay",
        beacon: trial.cue,
        trialIndex: i,
      };
    if (t <= trial.tOutcome) {
      const span = Math.max(1e-3, trial.tOutcome - trial.tTarget);
      return {
        ...empty,
        phase: "target",
        beacon: trial.cue,
        objectClass: trial.objectClass,
        objectProgress: Math.min(1, (t - trial.tTarget) / span),
        trialIndex: i,
      };
    }
    const next = tracks[i + 1];
    if (!next || t < (next.tCue ?? next.tTarget)) {
      return {
        ...empty,
        feedback: t - trial.tOutcome <= FEEDBACK_S ? trial.outcome : null,
        trialIndex: i,
        phase: next ? "iti" : "done",
      };
    }
  }
  return { ...empty, phase: "done", trialIndex: tracks.length - 1 };
}
