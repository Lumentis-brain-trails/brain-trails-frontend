/**
 * What each setting of a block is called and what it is for, in an author's words.
 *
 * The forms are drawn from the kinds' schemas, which know types and bounds but not
 * meaning: `goRatio`, `itiMs` and `maxNogoRun` are exact and unreadable. This table puts
 * a name and one or two sentences on every setting, decides which ones an author needs
 * at first (`advanced` ones fold away), hides the ones the builder fills in itself
 * (`media_id` comes from dragging a video in), and words the choices of a select.
 *
 * Keys are the setting's path with list indexes dropped: `lines.text` documents the
 * `text` of every row of `lines`. A kind's own entry wins over `COMMON`. A setting with
 * no entry keeps its derived name and counts as advanced, so a new schema property is
 * never lost - only unexplained until it is added here (a test lists the gaps).
 */

import type { Field } from "@/lib/builder/fields";

export interface FieldDoc {
  label?: string;
  /** Shown behind the field's info button. */
  help?: string;
  advanced?: boolean;
  /** Filled in by the builder, never typed: not drawn at all. */
  hidden?: boolean;
  /** Words for the values of a select. */
  options?: Record<string, string>;
}

const MARKER_HELP =
  "The name this moment gets in the recording's event timeline. Change it only if your analysis expects a specific name.";

/** Settings that mean the same thing in every kind. */
const COMMON: Record<string, FieldDoc> = {
  media_id: { hidden: true },
  src: { hidden: true },
  poster: { hidden: true },
  markers: { label: "Event names", advanced: true, help: MARKER_HELP },
  "lines.text": {
    label: "Text",
    help: "What the participant reads. A new line in the box is a new line on screen.",
  },
  "lines.holdMs": {
    label: "Stays on screen (ms)",
    help: "How long this line is shown before the next one. 1000 ms is one second.",
  },
  "lines.marker": { label: "Event name", advanced: true, help: MARKER_HELP },
  lines: {
    label: "Lines of text",
    help: "Shown one after another, in this order.",
  },
  advance: { label: "Moving on" },
  "advance.mode": {
    label: "The block ends",
    help: "After a fixed time, when the participant presses the button, or whichever comes first.",
    options: {
      timed: "After a fixed time",
      key: "When the participant continues",
      either: "Button, or a time limit",
    },
  },
  "advance.label": {
    label: "Button text",
    help: "What the button that moves on says, for example Continue or Start.",
  },
  "advance.ms": {
    label: "Duration (ms)",
    help: "How long the block lasts when it ends on its own.",
  },
  "advance.minMs": {
    label: "Button appears after (ms)",
    help: "The button is disabled until then, so nobody skips the text without reading it.",
    advanced: true,
  },
  "advance.maxMs": {
    label: "Moves on by itself after (ms)",
    help: "A time limit for a participant who never presses the button.",
    advanced: true,
  },
  footnote: {
    label: "Small print",
    help: "A quiet line under the text, for a reminder like 'you can stop at any time'.",
    advanced: true,
  },
};

const BY_KIND: Record<string, Record<string, FieldDoc>> = {
  video: {
    allowPause: {
      label: "The participant can pause",
      help: "Off keeps every participant on the same timeline, which is what you want when comparing them.",
    },
    endOn: {
      label: "The block ends",
      help: "When the video finishes, or after a fixed time even if the video is longer.",
      options: { ended: "When the video ends", duration: "After a fixed time" },
    },
    durationMs: {
      label: "Fixed time (ms)",
      help: "Only used when the block ends after a fixed time.",
    },
    cues: {
      label: "Moments to mark",
      help: "Points in the video you want to find again in the recording: a jump scare, a scene change. Each becomes an event on the timeline.",
      advanced: true,
    },
    "cues.atS": {
      label: "At (s)",
      help: "Seconds from the start of the video.",
    },
    "cues.label": {
      label: "Name",
      help: "How the event is called in the timeline.",
    },
    "cues.note": {
      label: "Note",
      help: "For you; the participant never sees it.",
    },
  },
  audio: {
    volume: {
      label: "Volume",
      help: "From 0 (silent) to 1 (the file's own level).",
    },
    start_s: {
      label: "Start at (s)",
      help: "Skip the beginning of the file: play from this second.",
    },
    end_s: {
      label: "Stop at (s)",
      help: "Cut the end of the file: stop at this second.",
    },
  },
  text: {
    body: { label: "Text", help: "What the participant reads." },
    min_s: {
      label: "Shortest reading time (s)",
      help: "Continue is disabled until then, so the text is actually read.",
    },
  },
  baseline: {
    eyes: {
      label: "Eyes",
      help: "Eyes closed gives the strongest alpha rhythm and is the reference the review page compares every block to. Eyes open is closer to how the other blocks are done.",
      options: { open: "Open", closed: "Closed" },
    },
    duration_s: {
      label: "Duration (s)",
      help: "One to two minutes is usual. Under 30 s is too short to be a stable reference.",
    },
    end_tone: {
      label: "Play a tone at the end",
      help: "So a participant with closed eyes knows when to open them.",
    },
  },
  rest: {
    mode: {
      label: "The break ends",
      help: "After a fixed time, or when the participant feels ready.",
      options: {
        timed: "After a fixed time",
        self_paced: "When the participant continues",
      },
    },
    duration_s: {
      label: "Duration (s)",
      help: "Used when the break ends after a fixed time.",
    },
    message: {
      label: "Message",
      help: "What the screen says during the break.",
    },
  },
  fixation: {
    duration_s: {
      label: "Duration (s)",
      help: "How long the cross stays. One second or two before a stimulus is usual.",
    },
  },
  countdown: {
    from: {
      label: "Count from",
      help: "3 shows 3, 2, 1 - one number per second.",
    },
  },
  breathing: {
    cycles: { label: "Breaths", help: "How many full in-and-out cycles." },
    inhaleMs: {
      label: "Breathe in (ms)",
      help: "How long the circle grows. 4500 ms with the same out is about 6.5 breaths a minute.",
    },
    holdMs: {
      label: "Hold (ms)",
      help: "A pause between in and out. Leave empty for none.",
      advanced: true,
    },
    exhaleMs: {
      label: "Breathe out (ms)",
      help: "How long the circle shrinks.",
    },
    lines: {
      label: "Text during the breathing",
      help: "Optional lines shown under the circle, one after another.",
      advanced: true,
    },
  },
  "go-no-go": {
    variant: {
      label: "Version",
      help: "Simple: dock the blue cargo, let the orange debris pass. With a beacon: a green or red light comes first and changes the rule, which is harder.",
      options: { simple: "Simple", cued: "With a beacon" },
    },
    n: {
      label: "Objects",
      help: "How many objects cross the screen. 100 takes about two minutes.",
    },
    goRatio: {
      label: "Share of cargo",
      help: "The fraction of objects to dock, from 0 to 1. Around 0.7 makes docking a habit, which is what makes holding back hard.",
    },
    validGoRatio: {
      label: "Share of green beacon + cargo",
      help: "The fraction of trials where the participant should dock, from 0 to 1.",
    },
    practice: {
      label: "Practice round first",
      help: "A few unscored objects before the real ones.",
    },
    travelMs: {
      label: "Crossing time (ms)",
      help: "How long an object takes to cross the screen: a shortest and a longest time, picked at random between the two. Shorter is harder.",
      advanced: true,
    },
    itiMs: {
      label: "Pause between objects (ms)",
      help: "Shortest and longest empty time between two objects.",
      advanced: true,
    },
    cueMs: {
      label: "Beacon stays on (ms)",
      help: "Shortest and longest time the beacon is lit.",
      advanced: true,
    },
    cueTargetMs: {
      label: "Beacon to object (ms)",
      help: "Shortest and longest wait between the beacon and the object.",
      advanced: true,
    },
    maxRun: {
      label: "Most cargo in a row",
      help: "Keeps the random order from producing long streaks that make the task predictable.",
      advanced: true,
    },
    maxNogoRun: {
      label: "Most debris in a row",
      help: "Same, for the objects to let pass.",
      advanced: true,
    },
    maxCueRun: {
      label: "Most same beacons in a row",
      advanced: true,
      help: "Limits streaks of the same beacon colour.",
    },
    maxOutcomeRun: {
      label: "Most same answers in a row",
      advanced: true,
      help: "Limits streaks of trials with the same right answer.",
    },
    nogoMix: {
      label: "Kinds of 'hold' trials",
      help: "How the trials where the participant must not dock are split. The three shares add up to 1.",
      advanced: true,
    },
    "nogoMix.redCargo": { label: "Red beacon + cargo" },
    "nogoMix.greenDebris": { label: "Green beacon + debris" },
    "nogoMix.redDebris": { label: "Red beacon + debris" },
  },
  "image-sequence": {
    items: { label: "Images", help: "Shown in this order, or shuffled." },
    "items.id": {
      label: "Name",
      help: "How this image is called in the timeline.",
    },
    "items.src": { label: "Image address", help: "The URL of the image." },
    "items.class": {
      label: "Category",
      help: "A group the image belongs to (faces, houses), for comparing categories later.",
    },
    "items.durationMs": { label: "Shown for (ms)" },
    isiMs: {
      label: "Gap between images (ms)",
      help: "Empty screen between two images.",
    },
    jitterMs: {
      label: "Random extra gap (ms)",
      help: "Up to this much is added to each gap, so the rhythm is not predictable.",
      advanced: true,
    },
    loops: { label: "Times through the list" },
    shuffle: {
      label: "Shuffle the order",
      help: "A different order per participant, the same for the same participant and seed.",
    },
  },
  questionnaire: {
    instrument: {
      label: "Questionnaire",
      help: "SAM asks how pleasant and how activated the participant feels, with pictures. VAS is a single slider. NASA-TLX measures workload. Custom uses your own questions below.",
      options: {
        sam: "SAM - how do you feel (pictures)",
        vas: "VAS - one slider",
        nasa_tlx: "NASA-TLX - workload",
        custom: "Custom - your questions",
      },
    },
    prompt: {
      label: "Question on top",
      help: "Shown above the scales, for example 'How did the video make you feel?'",
    },
    items: {
      label: "Your questions",
      help: "Only used by the Custom questionnaire.",
    },
    "items.id": {
      label: "Short name",
      help: "How the answer is called in the exported data.",
    },
    "items.text": { label: "Question" },
    "items.type": {
      label: "Answer with",
      options: {
        likert: "Points on a scale",
        slider: "A slider",
        choice: "One of several choices",
      },
    },
    "items.points": { label: "Points on the scale", help: "5 or 7 is usual." },
    "items.min": { label: "Lowest value" },
    "items.max": { label: "Highest value" },
    "items.anchors": {
      label: "Words at the two ends",
      help: "For example 'Not at all' and 'Extremely'.",
    },
    "items.choices": { label: "Choices" },
  },
  quiz: {
    scenes: { label: "Questions" },
    "scenes.prompt": { label: "Question" },
    "scenes.choices": { label: "Answers" },
    "scenes.correct": {
      label: "Right answer (number)",
      help: "The position of the right answer in the list, starting from 0.",
    },
    feedback: {
      label: "Say if the answer was right",
      help: "Off keeps the participant from learning during the quiz.",
    },
  },
};
BY_KIND.prompt = {};
BY_KIND.instructions = {};

/** A path's documentation key: list indexes dropped, segments dotted. */
export function docKey(path: string[]): string {
  return path.filter((segment) => !/^\d+$/.test(segment)).join(".");
}

/** The documentation of one setting, or undefined when nobody wrote it yet. */
export function docFor(kind: string, path: string[]): FieldDoc | undefined {
  const key = docKey(path);
  const own = BY_KIND[kind]?.[key];
  if (own) return own;
  if (COMMON[key]) return COMMON[key];
  // every event name is the same kind of setting, whatever the moment it names
  if (key.startsWith("markers.")) return { advanced: true, help: MARKER_HELP };
  return undefined;
}

export interface PresentedField extends Field {
  advanced: boolean;
  optionLabels?: Record<string, string>;
}

/**
 * Fields as an author should meet them: renamed, explained, split into the ones needed
 * at first and the advanced ones. `base` is the path of the list the fields are rows of.
 */
export function present(
  kind: string,
  fields: Field[],
  base: string[] = []
): PresentedField[] {
  const presented: PresentedField[] = [];
  for (const field of fields) {
    const path = [...base, ...field.path];
    const doc = docFor(kind, path);
    if (doc?.hidden) continue;
    // a nested setting inherits "advanced" from the group it belongs to
    const parent =
      path.length > 1 ? docFor(kind, path.slice(0, -1)) : undefined;
    presented.push({
      ...field,
      label: field.label ? (doc?.label ?? field.label) : field.label,
      description: doc?.help ?? field.description,
      advanced: doc ? (doc.advanced ?? parent?.advanced ?? false) : true,
      ...(doc?.options ? { optionLabels: doc.options } : {}),
    });
  }
  return presented;
}
