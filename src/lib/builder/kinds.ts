/**
 * What each block kind looks like and is called, everywhere an author meets it.
 *
 * The bin, the clips on the timeline, the monitor and the inspector's header all read
 * this one table, so a kind is recognised by the same name, colour and picture wherever
 * it appears (Alessio, 2026-09-20: "i task devo riuscire a riconoscerli intuitivamente").
 * The wire name (`go-no-go`) stays out of the interface.
 *
 * The colour and the family are facts of the kind and live here. The words are read in
 * the reader's language from the catalogue (`builder.kinds.<kind>`, `builder.palette.<id>`)
 * through the two hooks at the bottom; the English `label`/`hint` in the tables are what
 * a caller without a translator gets, and the fallback for a key nobody wrote yet.
 */

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { PaletteItem } from "@/lib/builder/draft";
import { setAtPath } from "@/lib/builder/fields";

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
  flanker: {
    label: "Arrows (flanker)",
    hint: "Which way does the middle arrow point? The arrows around it may disagree. With cues it is the Attention Network Test.",
    tone: "#f2a33c",
    family: "task",
  },
  "n-back": {
    label: "Letter memory (n-back)",
    hint: "Letters one at a time: press when this one is the letter from a few steps ago.",
    tone: "#9b8cff",
    family: "task",
  },
  coding: {
    label: "Symbol coding",
    hint: "Match symbols to digits against the clock: how many in ninety seconds.",
    tone: "#49c2a8",
    family: "task",
  },
  heartbeat: {
    label: "Heartbeat counting",
    hint: "Count your own heartbeats between two tones, without touching your pulse.",
    tone: "#e9668a",
    family: "task",
  },
  neurofeedback: {
    label: "Neurofeedback",
    hint: "A video that brightens while the chosen brain rhythm is in its target zone.",
    tone: "#8b7cf6",
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

/** What a kind is called and what the participant experiences, in the reader's language. */
export interface KindText {
  label: string;
  hint: string;
}

/**
 * `const kindText = useKindText(); kindText("go-no-go").label` inside a component.
 *
 * Reads `builder.kinds.<kind>` and falls back, word by word, to `identityOf`: a kind
 * the catalogue does not know keeps its English name, and a kind this app does not know
 * at all is still named after its wire name. A function rather than one kind's text,
 * because the bin and the timeline name many kinds in one render.
 */
export function useKindText(): (kind: string) => KindText {
  const t = useTranslations("builder.kinds");
  return useCallback(
    (kind: string) => {
      const fallback = identityOf(kind);
      const read = (word: "label" | "hint") => {
        const key = `${kind}.${word}`;
        // an unknown wire name may hold a dot, which the catalogue reads as nesting
        return kind !== "" && !kind.includes(".") && t.has(key as never)
          ? t(key as never)
          : fallback[word];
      };
      return { label: read("label"), hint: read("hint") };
    },
    [t]
  );
}

/**
 * `const localise = usePaletteText(); localise(item)` inside a component: one of the
 * bin's items (`ELEMENTS`) in the reader's language.
 *
 * The copy carries the translated `label` and `hint` (`builder.palette.<id>`) and, for
 * an item that declares `text`, the translated starting words written into its config.
 * A block made from it (`blockForElement`) is therefore named and worded in the
 * language its author was reading when it was added; that is content from then on, and
 * a stored block is never translated again. Anything without a key keeps the table's
 * English, and the item itself is not mutated.
 */
export function usePaletteText(): (item: PaletteItem) => PaletteItem {
  const t = useTranslations("builder.palette");
  return useCallback(
    (item: PaletteItem) => {
      const read = (key: string): string | undefined =>
        t.has(key as never) ? t(key as never) : undefined;
      let config = item.config;
      for (const [name, path] of Object.entries(item.text ?? {})) {
        const words = read(`${item.id}.text.${name}`);
        if (words !== undefined) config = setAtPath(config, path, words);
      }
      const hint = read(`${item.id}.hint`) ?? item.hint;
      return {
        ...item,
        label: read(`${item.id}.label`) ?? item.label,
        ...(hint !== undefined ? { hint } : {}),
        config,
      };
    },
    [t]
  );
}
