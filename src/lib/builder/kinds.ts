/**
 * What each block kind looks like and is called, everywhere an author meets it.
 *
 * The bin, the clips on the timeline, the monitor and the inspector's header all read
 * this one table, so a kind is recognised by the same name, colour and picture wherever
 * it appears (Alessio, 2026-09-20: "i task devo riuscire a riconoscerli intuitivamente").
 * The wire name (`go-no-go`) stays out of the interface.
 */

export interface KindIdentity {
  /** What an author calls it. */
  label: string;
  /** One line on what the participant experiences. */
  hint: string;
  /** A CSS colour (a token where one exists) that marks the kind's clips and covers. */
  tone: string;
  /** Broad family, used to order and group the bin. */
  family: "media" | "task" | "pause" | "ask" | "say";
}

export const KIND_IDENTITY: Record<string, KindIdentity> = {
  video: {
    label: "Video",
    hint: "Plays a video full screen.",
    tone: "var(--trail-c)",
    family: "media",
  },
  audio: {
    label: "Sound",
    hint: "Plays a sound on a dark screen.",
    tone: "var(--trail-b)",
    family: "media",
  },
  text: {
    label: "Reading",
    hint: "A text the participant reads at their own pace.",
    tone: "var(--trail-a)",
    family: "media",
  },
  "image-sequence": {
    label: "Image sequence",
    hint: "Images shown one after another, each with its own marker.",
    tone: "var(--trail-c)",
    family: "media",
  },
  "go-no-go": {
    label: "Signal Navigator",
    hint: "The go/no-go game: dock the cargo, let the debris pass.",
    tone: "#4f8ff7",
    family: "task",
  },
  breathing: {
    label: "Paced breathing",
    hint: "A circle that grows and shrinks to breathe with.",
    tone: "#3fbf7f",
    family: "task",
  },
  quiz: {
    label: "Quiz",
    hint: "Questions with right and wrong answers.",
    tone: "var(--trail-d)",
    family: "task",
  },
  baseline: {
    label: "Resting baseline",
    hint: "Sitting still, eyes open or closed: what every other block is compared to.",
    tone: "#94a3b8",
    family: "pause",
  },
  rest: {
    label: "Rest",
    hint: "A break between blocks, timed or until the participant continues.",
    tone: "#94a3b8",
    family: "pause",
  },
  fixation: {
    label: "Fixation cross",
    hint: "A cross to look at, to settle the eyes before a stimulus.",
    tone: "#94a3b8",
    family: "pause",
  },
  countdown: {
    label: "Countdown",
    hint: "3, 2, 1 before the next block.",
    tone: "#94a3b8",
    family: "pause",
  },
  questionnaire: {
    label: "Questionnaire",
    hint: "Asks how the participant feels (SAM) or your own questions.",
    tone: "var(--trail-d)",
    family: "ask",
  },
  instructions: {
    label: "Instructions",
    hint: "Text on screen that explains what comes next.",
    tone: "var(--trail-a)",
    family: "say",
  },
  prompt: {
    label: "Prompt",
    hint: "A short line on screen, then on with the run.",
    tone: "var(--trail-a)",
    family: "say",
  },
};

const UNKNOWN: KindIdentity = {
  label: "Block",
  hint: "",
  tone: "#94a3b8",
  family: "say",
};

/** A kind's identity; an unknown kind is a grey "Block" named after its wire name. */
export function identityOf(kind: string): KindIdentity {
  return KIND_IDENTITY[kind] ?? { ...UNKNOWN, label: kind };
}
