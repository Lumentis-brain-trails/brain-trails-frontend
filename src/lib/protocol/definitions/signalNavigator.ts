/**
 * Signal Navigator, as data.
 *
 * Every number here comes from `attention-task-spec.md`. The protocol is five generic
 * steps - prompt, go/no-go, breathing, cued go/no-go, prompt - so the whole task is a
 * composition of registered kinds and nothing about it is bespoke code.
 *
 * Marker labels are carried in the data rather than built into the renderers, which is how
 * the spec's fixed vocabulary (`challenge_a_stimulus_onset`, `coping_start`, ...) is
 * honoured without the `go-no-go` kind knowing it is ever called "Challenge A".
 *
 * Timing budget: 38 + 130 + 43 + 139 + 40 s of active task, about 6.5 minutes, which lands
 * inside the spec's 7-8.5 minutes once the notice and stage transitions are counted.
 */

import type { ProtocolDefinition } from "../types";

export const SIGNAL_NAVIGATOR: ProtocolDefinition = {
  id: "signal-navigator",
  version: 1,
  title: "Signal Navigator",
  contentWarning:
    "Objects move across the screen for about five minutes. A reduced-motion mode is available, and you can stop at any time.",
  startMarker: "session_start",
  endMarker: "session_end",
  steps: [
    {
      id: "arrival",
      kind: "prompt",
      label: "Get ready",
      phase: "arrival",
      startMarker: "arrival_start",
      endMarker: "arrival_end",
      config: {
        lines: [
          { text: "Cargo will cross your screen.", holdMs: 4000 },
          {
            text: "Press Dock for blue cargo.\nLet debris pass.",
            holdMs: 4000,
          },
        ],
        advance: {
          mode: "either",
          minMs: 30_000,
          maxMs: 45_000,
          label: "Start",
        },
      },
    },
    {
      id: "challenge_a",
      kind: "go-no-go",
      label: "Dock the cargo",
      phase: "challenge_a",
      startMarker: "challenge_a_start",
      endMarker: "challenge_a_end",
      config: {
        variant: "simple",
        n: 100,
        goRatio: 0.72,
        maxRun: 4,
        maxNogoRun: 2,
        travelMs: [800, 1200],
        itiMs: [300, 500],
        markers: {
          trialStart: "challenge_a_trial_start",
          stimulusOnset: "challenge_a_stimulus_onset",
          response: "challenge_a_response",
          outcome: "challenge_a_outcome",
        },
      },
    },
    {
      id: "reset",
      kind: "breathing",
      label: "Pause and plan",
      phase: "coping",
      startMarker: "coping_start",
      endMarker: "coping_end",
      config: {
        cycles: 3,
        inhaleMs: 4500,
        exhaleMs: 4500,
        markers: {
          cycleStart: "breath_cycle_start",
          inhale: "breath_inhale",
          exhale: "breath_exhale",
        },
        lines: [
          { text: "Notice the urge to rush.", holdMs: 4000 },
          {
            text: "For the next route:\nBeacon first, cargo second.",
            marker: "rule_instruction_shown",
            holdMs: 6000,
          },
          {
            text: "Green beacon + blue cargo\nDock.",
            marker: "rule_instruction_shown",
            holdMs: 5000,
          },
          {
            text: "Anything else\nHold.",
            marker: "rule_instruction_shown",
            holdMs: 5000,
          },
        ],
      },
    },
    {
      id: "challenge_b",
      kind: "go-no-go",
      label: "Wait for the signal",
      phase: "challenge_b",
      startMarker: "challenge_b_start",
      endMarker: "challenge_b_end",
      config: {
        variant: "cued",
        n: 44,
        validGoRatio: 0.45,
        // red+cargo is the theoretically interesting cell - the rule and the habit
        // disagree there - so it carries more of the no-go mass than the other two.
        nogoMix: { redCargo: 0.4, greenDebris: 0.3, redDebris: 0.3 },
        maxCueRun: 3,
        maxOutcomeRun: 3,
        cueMs: [300, 400],
        cueTargetMs: [800, 1200],
        travelMs: [900, 1300],
        itiMs: [500, 900],
        markers: {
          trialStart: "challenge_b_trial_start",
          cueOnset: "challenge_b_cue_onset",
          stimulusOnset: "challenge_b_target_onset",
          response: "challenge_b_response",
          outcome: "challenge_b_outcome",
        },
      },
    },
    {
      id: "outro",
      kind: "prompt",
      label: "Return",
      phase: "outro",
      startMarker: "outro_start",
      // No end marker: `session_end` terminates the run, and the spec's reference stream
      // has no `outro_end`.
      config: {
        lines: [
          { text: "Route complete.", holdMs: 4000 },
          { text: "Rest for a moment.", holdMs: 4000 },
        ],
        advance: { mode: "timed", ms: 40_000 },
        footnote: "This is not a medical test or diagnosis.",
      },
    },
  ],
};

/** Protocols shipped as code, resolved by the `module` name on a catalog item. */
export const PROTOCOL_MODULES: Record<string, ProtocolDefinition> = {
  "signal-navigator-v1": SIGNAL_NAVIGATOR,
};
