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

/** The signals a neurofeedback block can train on (backend V4-0009). */
export const NF_SIGNALS = [
  "alpha",
  "theta",
  "smr",
  "beta",
  "theta_beta",
  "alpha_theta",
] as const;

/** The Muse's electrodes, in its own order (`lib/muse/protocol.ts`). */
const NF_CHANNELS = ["TP9", "AF7", "AF8", "TP10"] as const;

/**
 * Live neurofeedback (backend V4-0009): a looped, muted video whose brightness - and, with `clarity`, sharpness - follows a band of the person's EEG
 * against a threshold. A baseline at neutral brightness comes first and, by default,
 * sets the threshold; the operator can nudge it from the console.
 *
 * `direction` and `channels` are left out by default and chosen from the signal
 * (`lib/neurofeedback/engine.ts`): theta, beta and theta/beta are trained down, the
 * others up; alpha and alpha/theta are read at TP9/TP10, the rest at AF7/AF8.
 */
export const neurofeedbackConfigSchema = z
  .object({
    ...mediaRefShape,
    signal: z.enum(NF_SIGNALS).default("alpha"),
    direction: z.enum(["up", "down"]).optional(),
    channels: z.array(z.enum(NF_CHANNELS)).min(1).max(4).optional(),
    effect: z.enum(["brightness", "clarity"]).default("brightness"),
    /** Training time after the baseline. */
    duration_s: z.number().int().min(30).max(1800).default(300),
    /** 0 for no baseline, which needs a fixed threshold. */
    baseline_s: z.number().int().min(0).max(180).default(60),
    threshold: z
      .discriminatedUnion("mode", [
        z.object({
          mode: z.literal("baseline"),
          /** Share of the baseline that would have been in target. */
          target_fraction: z.number().min(0.1).max(0.9).default(0.4),
        }),
        z.object({
          mode: z.literal("fixed"),
          /** Relative power (0-1) for a band; the ratio itself for a ratio. */
          value: z.number().positive(),
        }),
      ])
      .default({ mode: "baseline", target_fraction: 0.4 }),
    window_s: z.union([z.literal(1), z.literal(2)]).default(1),
    smoothing_s: z.number().min(0.25).max(5).default(1),
    /** How long a full swing of the picture takes. */
    ramp_s: z.number().min(1).max(20).default(3),
    /** The picture's brightness fully out of target. */
    min_level: z.number().min(0.2).max(0.9).default(0.4),
    artefact: z
      .object({
        max_ptp_uv: z.number().min(50).max(1000).default(150),
        max_muscle: z.number().min(0.05).max(0.9).default(0.35),
      })
      .default({ max_ptp_uv: 150, max_muscle: 0.35 }),
  })
  .refine(hasMediaRef, { message: MEDIA_REF_MESSAGE, path: ["src"] })
  .refine((c) => c.baseline_s > 0 || c.threshold.mode === "fixed", {
    message: "without a baseline the threshold must be fixed",
    path: ["threshold"],
  })
  .meta({
    ...MEDIA_REF_JSON,
    if: {
      properties: { baseline_s: { const: 0 } },
      required: ["baseline_s"],
    },
    then: {
      properties: {
        threshold: {
          properties: { mode: { const: "fixed" } },
          required: ["mode"],
        },
      },
      required: ["threshold"],
    },
  });
export type NeurofeedbackConfig = z.infer<typeof neurofeedbackConfigSchema>;
