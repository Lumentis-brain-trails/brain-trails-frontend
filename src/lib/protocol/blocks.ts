/**
 * Config schemas of the block kinds added with protocol trees (sprint S18).
 *
 * They live here rather than beside their renderers so they can be unit-tested and
 * exported as JSON Schema (`schemas/blocks.schema.json`) without importing React. The
 * backend validates stored block configs against that export, so a field added here is
 * a field the backend accepts after the paired copy - nothing is kept in sync by hand.
 *
 * Every user-facing string a kind shows by itself comes from `messages/en.json`
 * (`kinds.*`); strings in a config are protocol content and shown as written.
 */

import { z } from "zod";

/**
 * Library media ids are UUIDs, accepted loosely (`z.guid`) so the templates' placeholder
 * ids (`00000000-...-000000000001`) are valid too.
 */
export const mediaIdSchema = z.guid();

/**
 * A media-backed config names a library item (`media_id`, bound to `src` before the run
 * by `bindMedia`) or, for protocols written as code, a URL directly.
 */
export const mediaRefShape = {
  src: z.string().min(1).optional(),
  media_id: mediaIdSchema.optional(),
};

/** The `anyOf` the refinement below enforces, repeated for the JSON Schema export. */
export const MEDIA_REF_JSON = {
  anyOf: [{ required: ["src"] }, { required: ["media_id"] }],
};

export function hasMediaRef(config: { src?: string; media_id?: string }) {
  return config.src !== undefined || config.media_id !== undefined;
}

export const MEDIA_REF_MESSAGE = "either src or media_id is required";

export const fixationConfigSchema = z.object({
  duration_s: z.number().positive().default(1),
});
export type FixationConfig = z.infer<typeof fixationConfigSchema>;

export const baselineConfigSchema = z.object({
  eyes: z.enum(["open", "closed"]).default("open"),
  duration_s: z.number().positive().default(60),
  /** With eyes closed, a short tone says when it is over. */
  end_tone: z.boolean().default(true),
});
export type BaselineConfig = z.infer<typeof baselineConfigSchema>;

export const restConfigSchema = z
  .object({
    mode: z.enum(["timed", "self_paced"]).default("timed"),
    /** Required when timed; ignored when self-paced. */
    duration_s: z.number().positive().optional(),
    /** Optional protocol copy shown during the rest. */
    message: z.string().min(1).optional(),
  })
  .refine((c) => c.mode !== "timed" || c.duration_s !== undefined, {
    message: "a timed rest needs duration_s",
    path: ["duration_s"],
  })
  .meta({
    if: { properties: { mode: { const: "timed" } } },
    then: { required: ["duration_s"] },
  });
export type RestConfig = z.infer<typeof restConfigSchema>;

export const countdownConfigSchema = z.object({
  /** Counts `from`, `from - 1`, ... 1, one per second. */
  from: z.number().int().min(1).max(60).default(3),
});
export type CountdownConfig = z.infer<typeof countdownConfigSchema>;

export const audioConfigSchema = z
  .object({
    ...mediaRefShape,
    volume: z.number().min(0).max(1).default(1),
    start_s: z.number().min(0).default(0),
    end_s: z.number().positive().optional(),
  })
  .refine(hasMediaRef, { message: MEDIA_REF_MESSAGE, path: ["src"] })
  .meta(MEDIA_REF_JSON);
export type AudioConfig = z.infer<typeof audioConfigSchema>;

export const textConfigSchema = z
  .object({
    /** Plain text; blank lines separate paragraphs. */
    body: z.string().min(1).optional(),
    ...mediaRefShape,
    /** The Continue button unlocks after this long. */
    min_s: z.number().min(0).default(0),
  })
  .refine((c) => c.body !== undefined || hasMediaRef(c), {
    message: "either body, src or media_id is required",
    path: ["body"],
  })
  .meta({
    anyOf: [
      { required: ["body"] },
      { required: ["src"] },
      { required: ["media_id"] },
    ],
  });
export type TextConfig = z.infer<typeof textConfigSchema>;

export const questionnaireItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    text: z.string().min(1),
    type: z.enum(["likert", "slider", "choice"]).default("slider"),
    /** Likert: number of points. */
    points: z.number().int().min(2).max(11).default(7),
    /** Likert and slider: the words at either end. */
    anchors: z.tuple([z.string(), z.string()]).optional(),
    /** Slider range. */
    min: z.number().default(0),
    max: z.number().default(100),
    /** Choice: the options, in order. */
    choices: z.array(z.string().min(1)).min(2).optional(),
  })
  .refine((i) => i.type !== "choice" || i.choices !== undefined, {
    message: "a choice item needs choices",
    path: ["choices"],
  })
  .refine((i) => i.max > i.min, {
    message: "max must exceed min",
    path: ["max"],
  });
export type QuestionnaireItem = z.infer<typeof questionnaireItemSchema>;

export const QUESTIONNAIRE_INSTRUMENTS = [
  "sam",
  "vas",
  "nasa_tlx",
  "custom",
] as const;

export const questionnaireConfigSchema = z
  .object({
    /**
     * `sam` (valence, arousal, dominance; 9 points with manikins) and `nasa_tlx` (six
     * 0-100 scales) are fixed instruments; `vas` is 0-100 sliders over `items`;
     * `custom` is `items` of any type.
     */
    instrument: z.enum(QUESTIONNAIRE_INSTRUMENTS),
    /** Optional protocol copy above the items, e.g. "About the clip you just saw". */
    prompt: z.string().min(1).optional(),
    items: z.array(questionnaireItemSchema).min(1).optional(),
  })
  .refine(
    (c) =>
      (c.instrument !== "vas" && c.instrument !== "custom") ||
      c.items !== undefined,
    { message: "vas and custom questionnaires need items", path: ["items"] }
  );
export type QuestionnaireConfig = z.infer<typeof questionnaireConfigSchema>;

export const quizConfigSchema = z
  .object({
    scenes: z
      .array(
        z.object({
          prompt: z.string().min(1),
          choices: z.array(z.string().min(1)).min(2),
          /** Index into `choices`; absent for an opinion question. */
          correct: z.number().int().min(0).optional(),
        })
      )
      .min(1),
    /** Show right/wrong after each answer. */
    feedback: z.boolean().default(false),
  })
  .refine(
    (c) =>
      c.scenes.every(
        (s) => s.correct === undefined || s.correct < s.choices.length
      ),
    {
      message: "correct must index one of the scene's choices",
      path: ["scenes"],
    }
  );
export type QuizConfig = z.infer<typeof quizConfigSchema>;

/** The three SAM dimensions, in the order they are asked. */
export const SAM_DIMENSIONS = ["valence", "arousal", "dominance"] as const;

/** NASA-TLX subscales, in the instrument's order. */
export const NASA_TLX_SCALES = [
  "mental",
  "physical",
  "temporal",
  "performance",
  "effort",
  "frustration",
] as const;
