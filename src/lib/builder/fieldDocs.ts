/**
 * What each setting of a block is called and what it is for, in an author's words.
 *
 * The forms are drawn from the kinds' schemas, which know types and bounds but not
 * meaning: `goRatio`, `itiMs` and `maxNogoRun` are exact and unreadable. Every setting
 * gets a name and one or two sentences, a decision on whether an author needs it at
 * first (`advanced` ones fold away), a way out for the ones the builder fills in itself
 * (`media_id` comes from dragging a video in), and words for the choices of a select.
 *
 * It is kept in two halves. The facts - which settings are documented, which are
 * advanced, which are hidden - are the tables below. The words are in the catalogue,
 * so they read in the author's language: `builder.fields.<scope>.<setting>` holds a
 * `label`, a `help` (shown behind the field's info button) and `options` (one entry per
 * value of a select), each optional. `<scope>` is the kind's wire name, or `common` for
 * the settings that mean the same thing in every kind. `<setting>` is the path with
 * its segments joined by `/` (`lines/text`), because the catalogue reads a dot as
 * nesting and a setting's own name may be `label` or contain an underscore.
 *
 * Table keys are the setting's path with list indexes dropped: `lines.text` documents
 * the `text` of every row of `lines`. A kind's own entry wins over `COMMON`. A setting
 * with no entry keeps its derived name and counts as advanced, so a new schema property
 * is never lost - only unexplained until it is added here and worded in the catalogue
 * (the tests list both gaps).
 */

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { Field } from "@/lib/builder/fields";

/** The facts about one documented setting; `{}` is one with nothing special about it. */
export interface FieldDoc {
  advanced?: boolean;
  /** Filled in by the builder, never typed: not drawn at all. */
  hidden?: boolean;
}

/** A documented setting, and where its words are in the catalogue. */
export interface LocatedFieldDoc extends FieldDoc {
  /** The setting's key under `builder.fields`, e.g. `video.cues/atS`. */
  words: string;
}

/**
 * Reads one string of the field documentation: `key` is relative to `builder.fields`
 * (`video.endOn.label`). Undefined when the catalogue has no such key, so the caller
 * falls back to what the schema says.
 */
export type FieldWords = (key: string) => string | undefined;

/** Settings that mean the same thing in every kind. */
const COMMON: Record<string, FieldDoc> = {
  media_id: { hidden: true },
  src: { hidden: true },
  poster: { hidden: true },
  markers: { advanced: true },
  "lines.text": {},
  "lines.holdMs": {},
  "lines.marker": { advanced: true },
  lines: {},
  advance: {},
  "advance.mode": {},
  "advance.label": {},
  "advance.ms": {},
  "advance.minMs": { advanced: true },
  "advance.maxMs": { advanced: true },
  footnote: { advanced: true },
};

const BY_KIND: Record<string, Record<string, FieldDoc>> = {
  video: {
    allowPause: {},
    endOn: { advanced: true },
    durationMs: { advanced: true },
    start_s: {},
    end_s: {},
    cues: { advanced: true },
    "cues.atS": {},
    "cues.label": {},
    "cues.note": {},
  },
  audio: {
    volume: {},
    start_s: {},
    end_s: {},
  },
  text: {
    body: {},
    min_s: {},
  },
  baseline: {
    eyes: {},
    duration_s: {},
    end_tone: {},
  },
  rest: {
    mode: {},
    duration_s: {},
    message: {},
  },
  fixation: {
    duration_s: {},
  },
  countdown: {
    from: {},
  },
  flanker: {
    n: {},
    congruentRatio: {},
    cues: {},
    practice: {},
    feedback: {},
    maxRun: { advanced: true },
    cueMs: { advanced: true },
    cueTargetMs: { advanced: true },
    stimulusMs: { advanced: true },
    itiMs: { advanced: true },
  },
  "n-back": {
    pace: {},
    n: {},
    load: {},
    matchRatio: {},
    lureRatio: { advanced: true },
    practice: {},
    stimulusMs: { advanced: true },
    isiMs: { advanced: true },
    gapMs: { advanced: true },
  },
  coding: {
    duration_s: {},
    practice: {},
    pairs: {},
    itiMs: { advanced: true },
  },
  neurofeedback: {
    signal: {},
    direction: {},
    channels: { advanced: true },
    effect: {},
    duration_s: {},
    baseline_s: {},
    threshold: {},
    "threshold.mode": {},
    "threshold.target_fraction": {},
    "threshold.value": {},
    window_s: { advanced: true },
    smoothing_s: { advanced: true },
    ramp_s: { advanced: true },
    min_level: { advanced: true },
    artefact: { advanced: true },
    "artefact.max_ptp_uv": { advanced: true },
    "artefact.max_muscle": { advanced: true },
  },
  heartbeat: {
    intervals_s: {},
    shuffle: {},
    confidence: {},
    ready_s: { advanced: true },
  },
  breathing: {
    cycles: {},
    inhaleMs: {},
    holdMs: { advanced: true },
    exhaleMs: {},
    lines: {},
  },
  "go-no-go": {
    variant: {},
    n: {},
    goRatio: {},
    validGoRatio: {},
    practice: {},
    travelMs: { advanced: true },
    itiMs: { advanced: true },
    cueMs: { advanced: true },
    cueTargetMs: { advanced: true },
    maxRun: { advanced: true },
    maxNogoRun: { advanced: true },
    maxCueRun: { advanced: true },
    maxOutcomeRun: { advanced: true },
    nogoMix: { advanced: true },
    "nogoMix.redCargo": {},
    "nogoMix.greenDebris": {},
    "nogoMix.redDebris": {},
  },
  "image-sequence": {
    items: {},
    "items.id": {},
    "items.src": {},
    "items.class": {},
    "items.durationMs": {},
    isiMs: {},
    jitterMs: { advanced: true },
    loops: {},
    shuffle: {},
  },
  questionnaire: {
    instrument: {},
    prompt: {},
    items: {},
    "items.id": {},
    "items.text": {},
    "items.type": {},
    "items.points": {},
    "items.min": {},
    "items.max": {},
    "items.anchors": {},
    "items.choices": {},
  },
  quiz: {
    scenes: {},
    "scenes.prompt": {},
    "scenes.choices": {},
    "scenes.correct": {},
    feedback: {},
  },
  prompt: {},
  instructions: {},
};

/**
 * Every event name is the same kind of setting, whatever the moment it names: the
 * children of `markers` share one entry (and one explanation) instead of one per name.
 */
const ANY_MARKER = "markers/*";

/** A path's documentation key: list indexes dropped, segments dotted. */
export function docKey(path: string[]): string {
  return path.filter((segment) => !/^\d+$/.test(segment)).join(".");
}

/** A documentation key as the catalogue spells it: `lines.text` -> `lines/text`. */
function catalogueKey(key: string): string {
  return key.split(".").join("/");
}

/** The documentation of one setting, or undefined when nobody wrote it yet. */
export function docFor(
  kind: string,
  path: string[]
): LocatedFieldDoc | undefined {
  const key = docKey(path);
  const own = BY_KIND[kind]?.[key];
  if (own) return { ...own, words: `${kind}.${catalogueKey(key)}` };
  const common = COMMON[key];
  if (common) return { ...common, words: `common.${catalogueKey(key)}` };
  if (key.startsWith("markers."))
    return { advanced: true, words: `common.${ANY_MARKER}` };
  return undefined;
}

/**
 * Every documented setting as `[scope, catalogue key]`, the shared event-name entry
 * included. For the tests that hold the tables and the catalogue to each other.
 */
export function documentedSettings(): [scope: string, setting: string][] {
  const out: [string, string][] = [];
  for (const [scope, table] of [
    ["common", COMMON] as const,
    ...Object.entries(BY_KIND),
  ])
    for (const key of Object.keys(table)) out.push([scope, catalogueKey(key)]);
  out.push(["common", ANY_MARKER]);
  return out;
}

/**
 * `const words = useFieldWords()` inside a component: the field documentation in the
 * reader's language, for `present`.
 */
export function useFieldWords(): FieldWords {
  const t = useTranslations("builder.fields");
  return useCallback(
    (key: string) => (t.has(key as never) ? t(key as never) : undefined),
    [t]
  );
}

export interface PresentedField extends Field {
  advanced: boolean;
  optionLabels?: Record<string, string>;
}

/**
 * Fields as an author should meet them: renamed, explained, split into the ones needed
 * at first and the advanced ones. `words` reads the names and explanations
 * (`useFieldWords` in a component); whatever it does not have keeps what the schema
 * gave - the derived name, the schema's description, the raw value of a choice.
 * `base` is the path of the list the fields are rows of.
 */
export function present(
  kind: string,
  fields: Field[],
  words: FieldWords,
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
    const read = (word: string) =>
      doc ? words(`${doc.words}.${word}`) : undefined;
    const optionLabels: Record<string, string> = {};
    for (const option of field.options ?? []) {
      // a value with a dot cannot be a catalogue key; it is shown as it is
      const label = option.includes(".")
        ? undefined
        : read(`options.${option}`);
      if (label !== undefined) optionLabels[option] = label;
    }
    presented.push({
      ...field,
      label: field.label ? (read("label") ?? field.label) : field.label,
      description: read("help") ?? field.description,
      advanced: doc ? (doc.advanced ?? parent?.advanced ?? false) : true,
      ...(Object.keys(optionLabels).length > 0 ? { optionLabels } : {}),
    });
  }
  return presented;
}
