# Signal Navigator — EEG Cognitive Task Spec (v2)

## Purpose

Build a short, non-diagnostic EEG task that elicits response-control/inhibition behavior across three stages:

1. an unassisted inhibitory-control challenge,
2. a brief CBT-inspired reset that installs a cue-based rule ("implementation intention"), and
3. a related re-challenge in which the participant applies a cue to guide fast decisions.

This is **not** an ADHD test, diagnostic tool, intelligence test, or dopamine measurement. It elicits task-linked attention and response-control activity for downstream analysis (handled separately from this spec).

## Key design correction from v1

A full breathe-notice-choose sequence cannot fit inside a ~1-second response window. The fix:

- The **breathing/reset** happens once, between blocks — not on every trial.
- The **coping skill** installed during the reset is a short **if-then rule** ("beacon first, cargo second"), which the participant then applies automatically and quickly in Challenge B.
- Challenge B uses a **cue → delay → target** structure so there is a real preparation window (roughly 2–3 seconds from cue onset to end of response window), not an impossible one-second reflection window.

---

## Visual theme

Use a **space theme**. Adult-friendly, clean, easy to animate, and cue signals (beacons) are visually natural.

Working title: **Signal Navigator**

Narrative:

> You are guiding a spacecraft through a stream of signals. First, act on the correct cargo. Then reset and learn a signal rule. Then use the beacon to decide when to dock.

### Core visual assets

- Dark, calm space background, sparse stars, minimal parallax.
- A stationary docking station near center/right of screen.
- Objects move horizontally left to right at a constant, controlled speed.
- Blue cargo pods = main target class.
- Orange/red debris = main non-target class.
- Green and red beacon icons for the cue stage (use icon shape difference, not color alone).
- One response input: Space bar, mouse click, or a large on-screen "Dock" button.
- Minimal, deterministic feedback animations only.

### Minimal animation rules

- Correct Go response: cargo pod glides into the docking bay, attaches with a small, calm glow.
- Correct No-Go withholding: item continues past the docking bay and exits the screen.
- Commission error: item is briefly pulled toward the dock, then drifts away — no punishment sound, explosion, or shame-inducing feedback.
- Omission: an eligible pod simply passes by, no negative feedback.
- No points, coins, leaderboards, countdowns, random rewards, badges, streak multipliers, or large celebrations.

### Fruit-theme skin (optional, same mechanics)

| Space element    | Fruit-theme equivalent  |
| ---------------- | ----------------------- |
| Blue cargo pod   | Ripe fruit              |
| Debris           | Non-fruit object        |
| Docking station  | Basket                  |
| Green/red beacon | Green/red orchard sign  |
| Dock animation   | Fruit drops into basket |

Use identical event schema, timing, and logic under either skin.

---

## Session structure

Target total active task time: **~7–8.5 minutes**.

| Stage                       |  Duration | User-facing label     | Purpose                                                |
| --------------------------- | --------: | --------------------- | ------------------------------------------------------ |
| Arrival                     |   30–45 s | "Get ready"           | Low-demand settling; confirm EEG signal quality        |
| Challenge A: Reflex Docking | 2–2.5 min | "Dock the cargo"      | Unassisted Go/No-Go response control                   |
| Reset: Pause Beacon         |   45–60 s | "Pause and plan"      | Brief breathing + installs the cue rule (if-then plan) |
| Challenge B: Signal Docking | 2–2.5 min | "Wait for the signal" | Cue-guided preparation and inhibition (near transfer)  |
| Quiet Orbit                 |   30–45 s | "Return"              | Post-task settling, no responses                       |

Experiential arc:

```text
Automatic responding → Reset and plan → Cue-guided deliberate responding
```

---

## Stage 1: Arrival

**Duration:** 30–45 seconds.

Static docking station, faint stars. Short instruction:

> "Cargo will cross your screen. Press Dock for blue cargo. Let debris pass."

- Optionally run 3–5 practice trials, tagged `practice = true`, excluded from primary analysis.
- Use this interval to confirm signal quality and capture a low-demand reference segment.
- Keep the scene visually quiet; minimize unnecessary motion.

**Event markers:**

```text
session_start
arrival_start
practice_trial
arrival_end
```

---

## Stage 2: Challenge A — Reflex Docking

**Duration:** 2–2.5 minutes.

**Rule:** Press once to dock a blue cargo pod. Do not press for debris.

Instruction:

> "Dock blue cargo. Let everything else pass."

### Trial parameters

- Stimulus-onset asynchrony: ~1.1–1.5 s, with modest jitter.
- Object travel/response duration: ~800–1,200 ms.
- Go trial proportion: ~70–75% blue cargo.
- No-Go trial proportion: ~25–30% debris.
- Randomize sequence; avoid excessively long runs of one trial type.
- Keep No-Go frequency high enough for meaningful behavioral events, but not so rare it becomes a pure oddball.

### Per-trial data to log

```text
trial_id
phase = challenge_a
trial_type = go | nogo
stimulus_class = cargo | debris
stimulus_onset_timestamp
response_timestamp (if any)
reaction_time_ms (if any)
outcome = hit | miss | correct_rejection | commission_error
object_speed
intertrial_interval_ms
```

### Event markers

```text
challenge_a_start
challenge_a_trial_start
challenge_a_stimulus_onset
challenge_a_response
challenge_a_outcome
challenge_a_end
```

---

## Stage 3: Reset — Pause Beacon

**Duration:** 45–60 seconds.

This stage does two things, and both should be clearly separated in the UI and in the instruction text:

1. A brief breathing/settling exercise (state transition, not a decision-making tool).
2. Rehearsal of a simple if-then rule the participant will use in Challenge B (the actual coping/coping-adjacent mechanism).

### Screen sequence

1. Freeze the action; fade into a quiet space scene.
2. Show a softly expanding/contracting circular beacon for 3 slow breaths (~4–5 s inhale, ~4–5 s exhale each).
3. Present the rule to be used next, paced one line at a time.

### Suggested copy

```text
Take three slow breaths.

Notice the urge to rush.

For the next route:
Beacon first, cargo second.

Green beacon + blue cargo -> Dock.
Anything else -> Hold.
```

Do not include per-trial breathing instructions inside Challenge B. The breathing happens here, once; Challenge B only requires applying the rule already rehearsed.

### Event markers

```text
coping_start
breath_cycle_start
breath_inhale
breath_exhale
rule_instruction_shown
coping_end
```

---

## Stage 4: Challenge B — Signal Docking

**Duration:** 2–2.5 minutes.

**Rule:** A beacon appears before each object. Dock a blue cargo pod **only if it follows a green beacon**. Withhold in all other cases.

Instruction:

> "Watch the beacon first. Dock blue cargo only after green. Let everything else pass."

### Valid/invalid trial matrix

| Preceding beacon | Object         | Required response |
| ---------------- | -------------- | ----------------- |
| Green            | Blue cargo pod | Press Dock        |
| Red              | Blue cargo pod | Do not press      |
| Green            | Debris         | Do not press      |
| Red              | Debris         | Do not press      |

### Timing (cue -> delay -> target -> response window)

This is the critical fix from v1: the participant gets a real preparation interval, not an impossible one-second reflect-and-choose window.

| Segment                                 |     Duration | What happens                                       |
| --------------------------------------- | -----------: | -------------------------------------------------- |
| Beacon onset                            |   300–400 ms | Green or red icon appears                          |
| Cue-target delay                        | 800–1,200 ms | Quiet interval; participant holds the rule in mind |
| Target (object) onset + response window | 900–1,300 ms | Cargo/debris crosses screen; response allowed      |
| Intertrial interval                     |   500–900 ms | Reset attention before next beacon                 |

Total cue-to-response-window-end: roughly **2–3 seconds**, sufficient for a genuine prepare-then-decide sequence.

### Trial mix

- Valid Go trials (green + cargo): ~40–50%.
- Combined No-Go conditions (red + cargo, green + debris, red + debris): ~50–60% combined.
- Pilot and adjust to avoid floor/ceiling error rates.
- Avoid long runs of the same cue color or same outcome.

### Per-trial data to log

```text
trial_id
phase = challenge_b
cue = green | red
cue_onset_timestamp
target_onset_timestamp
object_class = cargo | debris
is_valid_go_trial = true | false
response_timestamp (if any)
reaction_time_ms (if any)
outcome = hit | miss | correct_rejection | commission_error
cue_target_interval_ms
object_speed
intertrial_interval_ms
```

### Event markers

```text
challenge_b_start
challenge_b_cue_onset
challenge_b_target_onset
challenge_b_response
challenge_b_outcome
challenge_b_end
```

---

## Stage 5: Quiet Orbit

**Duration:** 30–45 seconds.

Calm fixation screen, no stimuli requiring response.

Copy:

> "Route complete. Rest for a moment."

### Event markers

```text
outro_start
session_end
```

---

## Full event marker stream (reference)

```text
session_start
arrival_start
practice_trial
arrival_end
challenge_a_start
challenge_a_trial_start
challenge_a_stimulus_onset
challenge_a_response
challenge_a_outcome
challenge_a_end
coping_start
breath_cycle_start
breath_inhale
breath_exhale
rule_instruction_shown
coping_end
challenge_b_start
challenge_b_cue_onset
challenge_b_target_onset
challenge_b_response
challenge_b_outcome
challenge_b_end
outro_start
session_end
```

### Recommended event payload shape

```json
{
  "event_name": "challenge_b_target_onset",
  "timestamp_monotonic_ms": 0,
  "session_id": "uuid",
  "trial_id": 0,
  "phase": "challenge_b",
  "cue": "green",
  "stimulus_class": "cargo",
  "required_action": "press",
  "stimulus_id": "cargo_blue_01",
  "planned_onset_ms": 0,
  "actual_onset_ms": 0
}
```

```json
{
  "event_name": "response",
  "timestamp_monotonic_ms": 0,
  "session_id": "uuid",
  "trial_id": 0,
  "phase": "challenge_b",
  "response_type": "dock_press",
  "reaction_time_ms": 0,
  "outcome": "hit"
}
```

Log both planned and actual presentation timestamps where possible. Browser animation-frame timing is not equivalent to verified stimulus onset — validate timing accuracy separately during development, and align all events to the EEG clock or a validated synchronized clock.

---

## Behavioral summary metrics

Compute per stage and for the whole session:

- Go hit rate
- Omission/miss rate
- No-Go correct-rejection rate
- Commission/false-dock rate
- Median reaction time on correct Go trials
- Reaction-time variability (e.g., median absolute deviation)
- Early vs. late performance within each challenge block
- Post-error slowing, if enough errors occur

If trial counts support it, compute signal-detection metrics with standard edge-rate correction:

```text
d' = z(hit rate) - z(false-alarm rate)
criterion c = -0.5 x [z(hit rate) + z(false-alarm rate)]
```

**Interpretation caution:** fewer false docks alone does not mean better control — it can reflect responding less often overall. Always read hits, misses, false alarms, RT, RT variability, and criterion together, not any single metric in isolation.

---

## Product language and safety constraints

### Approved framing

> "This task elicits attention, pausing, and cue-guided response patterns for later analysis."

> "This is not a medical assessment or diagnosis."

### Do not claim

- The task diagnoses ADHD or any other condition.
- A single breathing/reset exercise clinically improves inhibitory control.
- Any behavioral change after the reset proves the reset caused it.
- Performance differences reflect dopamine, motivation, intelligence, or willpower.

### Important methodological caveat

Challenge B is intentionally related but not identical to Challenge A, to reduce simple task-repetition effects. It does **not** eliminate practice, novelty, fatigue, order, or expectancy effects. Any claim about the coping skill's causal effect requires a separate, counterbalanced, repeated-session validation study (e.g., comparing a reset-with-rule condition vs. a rule-only-no-breathing condition, or randomizing block order across participants).

---

## Implementation checklist

### Functional requirements

- [ ] One-button response input works via keyboard and click/touch.
- [ ] Trial generator supports deterministic seeds for reproducibility.
- [ ] Trial generator enforces trial-ratio and run-length constraints.
- [ ] All display, cue, response, and outcome events are timestamped.
- [ ] Trial data is saved locally/remotely in a structured schema.
- [ ] EEG stream and behavioral stream can be aligned via shared timestamps.
- [ ] Each stage emits clear start/end markers.
- [ ] Reset stage runs exactly 3 timed breathing cycles before showing the rule.
- [ ] Challenge B enforces the cue -> delay -> target -> response-window timing.
- [ ] Feedback animations are calm, deterministic, and noncompetitive (no punishment/celebration effects).

### UX requirements

- [ ] Instruction text is short and concrete; one active rule at a time.
- [ ] Beacon distinction uses shape/icon in addition to color (colorblind-safe).
- [ ] Optional sound toggle; sound is never required for correct performance.
- [ ] Provide a clear exit/stop control at all times.
- [ ] Show a brief motion/visual-sensitivity notice before the moving-object stages.
- [ ] Reset stage clearly separates "breathe" (state transition) from "here's the rule" (task instruction) — do not blend them into a per-trial action.

### Pilot requirements

- [ ] Pilot without making ADHD-related claims to participants.
- [ ] Confirm comprehension of both task rules (A and B) before collecting main data.
- [ ] Measure actual error rates in Challenge A and B; tune difficulty so neither is trivial nor overwhelming.
- [ ] Check No-Go and error trial counts are adequate for downstream analysis needs.
- [ ] Test browser/device latency and actual event-marker alignment against ground truth.
- [ ] Test whether animations cause eye, facial, or head-movement artifacts.
- [ ] Record sleepiness, caffeine, medication timing, stress, and time of day as optional context fields.

---

## Screen copy reference

### Intro

```text
Signal Navigator

Guide cargo through a moving signal stream.
Press Dock for the correct cargo. Let the rest pass.
```

### Challenge A

```text
Dock the cargo

Press Dock for blue cargo.
Let debris pass.
```

### Reset

```text
Pause and plan

Take three slow breaths.
Notice the urge to rush.

For the next route:
Beacon first, cargo second.
Green + blue cargo -> Dock.
Anything else -> Hold.
```

### Challenge B

```text
Wait for the signal

Watch the beacon first.
Dock blue cargo only after green.
Let everything else pass.
```

### Outro

```text
Route complete

Rest for a moment.
This is not a medical test or diagnosis.
```
