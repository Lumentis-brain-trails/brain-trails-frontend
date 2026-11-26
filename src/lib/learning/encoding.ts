/**
 * The Encoding module: how to turn a picture into a few numbers and back.
 *
 * It climbs one idea, a step at a time: a point on a line is one number; a point on a
 * plane, two; a gaussian bell, one to three depending on what is allowed to change; a
 * wave, two; a train of bells, three; two bells, six; a heartbeat, eight bells and so
 * twenty-five numbers. Then an EEG, where nobody knows the recipe, and the variational
 * autoencoder, which learns one. Each step asks the same three questions - how many
 * numbers, which values, how to rebuild the picture from them (decoding).
 *
 * The words are in `messages/*.json` under `learning.encoding`; this file holds only
 * numbers and structure, and every figure is drawn from them (`LearningFigure`).
 */
import type {
  Example,
  FigureSpec,
  Param,
  ParamName,
  Question,
} from "@/lib/learning/questions";
import { ECG_WAVES, type Part, ecg } from "@/lib/learning/signals";

/** A step's words live under `learning.encoding.steps.<id>` (title, body). */
export type EncodingStepId =
  | "intro"
  | "line"
  | "plane"
  | "bellPosition"
  | "bellHeight"
  | "bellWidth"
  | "waves"
  | "train"
  | "twoBells"
  | "ecg"
  | "eeg"
  | "vae"
  | "recap";

/** The models a playground's sliders drive. */
export type PlaygroundModel = "bell" | "wave" | "train";

/**
 * Sliders that rebuild a signal from its numbers (decoding by hand), drawn over a target
 * the person tries to match. `target` is the code of the original.
 */
export interface Playground {
  id: string;
  model: PlaygroundModel;
  target: Param[];
  sliders: { name: ParamName; min: number; max: number; step: number }[];
  domain: [number, number];
  yRange: [number, number];
}

/**
 * The interactive pieces a step can hold: the heartbeat taken apart (`ecg`), and the
 * Neural Networks module's labs - a neuron as a logic gate (`gates`), a line that splits
 * dots (`line`, `lineXor`), the hand-wired XOR network (`xor`), a neuron learning
 * (`learn`), a network learning digits (`digits`); Brain Plasticity's braided path
 * (`braid`), city at night (`city`) and ball on a landscape (`ball*`).
 */
export type Lab =
  | "ecg"
  | "gates"
  | "gatesLearn"
  | "classify"
  | "lineXor"
  | "xor"
  | "learn"
  | "digits"
  | "braid"
  | "city"
  | "ballHard"
  | "ballRestless"
  | "ballSoft"
  | "ballWind";

/** One screen of a module; its words are under `learning.<module key>.steps.<id>`. */
export interface Step {
  id: string;
  /** Nine pictures of one family, their codes hidden until asked for. */
  gallery?: Example[];
  /** One larger picture. */
  figure?: FigureSpec;
  /**
   * The figure answers the questions (a graph of what they ask): it shows with the
   * reveal, after the questions, instead of above them.
   */
  figureAnswers?: boolean;
  lab?: Lab;
  /** Pages of the product to open from this step (the demo), with their labels. */
  links?: { href: string; words: Words }[];
  playground?: Playground;
  /**
   * The step has `steps.<id>.reveal`: what the questions were about (the count, the
   * names of the numbers), shown only once they are answered so the body does not
   * give them away. A playground waits for the answers too.
   */
  reveal?: boolean;
  questions: Question[];
}

const SIGNAL_RANGE: [number, number] = [0, 10];
const BELL_Y: [number, number] = [-0.15, 2.2];

/** The parts a playground draws for a set of slider values. */
export function playgroundParts(
  model: PlaygroundModel,
  v: Partial<Record<ParamName, number>>
): Part[] {
  switch (model) {
    case "bell":
      return [
        { type: "bell", mu: v.mu ?? 5, a: v.a ?? 1, sigma: v.sigma ?? 1 },
      ];
    case "wave":
      return [{ type: "wave", fn: "sin", f: v.f ?? 1, a: v.a ?? 1 }];
    case "train":
      return [trainPart(v.rate ?? 1, v.a ?? 1, v.sigma ?? 0.1)];
  }
}

/**
 * What a value question's sliders draw: the person's guess, with the target behind it
 * (a hollow point, or the dashed signal), green once every value is close enough. The
 * target is the question's first figure; `values` follow its labels.
 */
export function guessFigure(
  q: Extract<Question, { kind: "value" }>,
  values: number[],
  ok: boolean
): FigureSpec | null {
  const target = q.figures?.[0];
  if (!q.model || !target) return null;
  const v: Partial<Record<ParamName, number>> = { ...q.fixed };
  q.labels.forEach((name, i) => (v[name] = values[i]));
  if (q.model === "line" && target.kind === "line")
    return { ...target, x: v.x ?? 0, ghost: target.x, ok };
  if (q.model === "plane" && target.kind === "plane")
    return {
      ...target,
      x: v.x ?? 0,
      y: v.y ?? 0,
      ghost: [target.x, target.y],
      ok,
    };
  if (target.kind !== "signal") return null;
  const parts: Part[] =
    q.model === "twoBells"
      ? twoBellsPart(
          v.rate ?? 1,
          v.a1 ?? 1,
          v.sigma1 ?? 0.1,
          v.a2 ?? -0.5,
          v.sigma2 ?? 0.1,
          v.d ?? 0.3
        )
      : q.model === "line" || q.model === "plane"
        ? []
        : playgroundParts(q.model, v);
  return { ...target, parts, ghost: target.parts, ok };
}

/** Where a value question's sliders start: the middle of each range, on a step. */
export function sliderStart(q: Extract<Question, { kind: "value" }>): number[] {
  return (q.sliders ?? []).map(
    (s) => s.min + Math.round((s.max - s.min) / 2 / s.step) * s.step
  );
}

/** A code as a record, for `playgroundParts`. */
export function codeValues(code: Param[]): Partial<Record<ParamName, number>> {
  return Object.fromEntries(code.map((p) => [p.name, p.value]));
}

function bellFigure(mu: number, a: number, sigma: number): FigureSpec {
  return {
    kind: "signal",
    parts: [{ type: "bell", mu, a, sigma }],
    domain: SIGNAL_RANGE,
    yRange: BELL_Y,
  };
}

/** One bell per beat, in the middle of the beat. */
function trainPart(rate: number, a: number, sigma: number): Part {
  return { type: "train", rate, bells: [{ mu: 0.5 / rate, a, sigma }] };
}

function trainFigure(rate: number, a: number, sigma: number): FigureSpec {
  return {
    kind: "signal",
    parts: [trainPart(rate, a, sigma)],
    domain: [0, 3],
    yRange: [-0.1, 2.2],
  };
}

/** A beat of two bells, the second one pointing down and `d` later. */
function twoBellsFigure(
  rate: number,
  a1: number,
  sigma1: number,
  a2: number,
  sigma2: number,
  d: number
): FigureSpec {
  return {
    kind: "signal",
    parts: twoBellsPart(rate, a1, sigma1, a2, sigma2, d),
    domain: [0, 3],
    yRange: [-1.3, 1.6],
  };
}

function twoBellsPart(
  rate: number,
  a1: number,
  sigma1: number,
  a2: number,
  sigma2: number,
  d: number
): Part[] {
  const first = 0.25 / rate;
  return [
    {
      type: "train",
      rate,
      bells: [
        { mu: first, a: a1, sigma: sigma1 },
        { mu: first + d, a: a2, sigma: sigma2 },
      ],
    },
  ];
}

function waveFigure(
  f: number,
  a: number
): Extract<FigureSpec, { kind: "signal" }> {
  return {
    kind: "signal",
    parts: [{ type: "wave", fn: "sin", f, a }],
    domain: [0, 2],
    yRange: [-1.8, 1.8],
  };
}

const p = (name: ParamName, value: number): Param => ({ name, value });

const LINE_X = [2, 7.5, 4, 9, 1, 5.5, 3, 8, 6.5];
const PLANE_XY: [number, number][] = [
  [2, 7],
  [8, 3],
  [5, 5],
  [1, 2],
  [7, 8],
  [3, 4],
  [9, 6],
  [4, 1],
  [6, 9],
];
const BELL_MU = [3, 7, 1.5, 5, 8.5, 2, 6, 4, 8];
const BELL_MU_A: [number, number][] = [
  [3, 1],
  [7, 2],
  [5, 0.5],
  [2, 1.5],
  [8, 1],
  [4, 2],
  [6, 1.5],
  [1.5, 0.5],
  [8.5, 2],
];
const BELL_MU_A_SIGMA: [number, number, number][] = [
  [3, 1, 0.5],
  [7, 2, 1],
  [5, 1.5, 2],
  [2, 2, 0.3],
  [6, 0.5, 1.5],
  [4, 1, 1],
  [8, 1.5, 0.5],
  [5, 2, 0.6],
  [5, 0.8, 2.5],
];
const WAVE_F_A: [number, number][] = [
  [1, 1],
  [2, 0.5],
  [0.5, 1.5],
  [3, 1],
  [1, 0.5],
  [2, 1.5],
  [0.5, 1],
  [3, 1.5],
  [1.5, 1],
];
const TRAIN_RATE_A_SIGMA: [number, number, number][] = [
  [1, 1, 0.1],
  [2, 2, 0.05],
  [3, 1, 0.05],
  [1, 2, 0.2],
  [2, 1, 0.1],
  [3, 1.5, 0.03],
  [1, 0.5, 0.05],
  [2, 1.5, 0.15],
  [1, 1.5, 0.3],
];
const TWO_BELLS: [number, number, number, number, number, number][] = [
  [1, 1, 0.08, -0.5, 0.08, 0.3],
  [2, 1, 0.04, -1, 0.04, 0.15],
  [1, 0.6, 0.15, -0.8, 0.05, 0.4],
  [1, 1.4, 0.05, -0.3, 0.15, 0.5],
  [2, 0.8, 0.06, -0.6, 0.06, 0.2],
  [1, 1, 0.03, -1, 0.03, 0.1],
  [1, 0.5, 0.1, -0.5, 0.1, 0.5],
  [2, 1.4, 0.03, -0.4, 0.08, 0.25],
  [1, 1.2, 0.1, -1.1, 0.2, 0.35],
];

const ex = (id: string, figure: FigureSpec, code: Param[]): Example => ({
  id,
  figure,
  code,
});

const LINE: Example[] = LINE_X.map((x, i) =>
  ex(`line${i}`, { kind: "line", x }, [p("x", x)])
);
const PLANE: Example[] = PLANE_XY.map(([x, y], i) =>
  ex(`plane${i}`, { kind: "plane", x, y }, [p("x", x), p("y", y)])
);
const BELL_POSITION: Example[] = BELL_MU.map((mu, i) =>
  ex(`bp${i}`, bellFigure(mu, 1.5, 0.8), [p("mu", mu)])
);
const BELL_HEIGHT: Example[] = BELL_MU_A.map(([mu, a], i) =>
  ex(`bh${i}`, bellFigure(mu, a, 0.8), [p("mu", mu), p("a", a)])
);
const BELL_WIDTH: Example[] = BELL_MU_A_SIGMA.map(([mu, a, sigma], i) =>
  ex(`bw${i}`, bellFigure(mu, a, sigma), [
    p("mu", mu),
    p("a", a),
    p("sigma", sigma),
  ])
);
const WAVES: Example[] = WAVE_F_A.map(([f, a], i) =>
  ex(`w${i}`, waveFigure(f, a), [p("f", f), p("a", a)])
);
const TRAINS: Example[] = TRAIN_RATE_A_SIGMA.map(([rate, a, sigma], i) =>
  ex(`t${i}`, trainFigure(rate, a, sigma), [
    p("rate", rate),
    p("a", a),
    p("sigma", sigma),
  ])
);
const TWO: Example[] = TWO_BELLS.map(([rate, a1, s1, a2, s2, d], i) =>
  ex(`tb${i}`, twoBellsFigure(rate, a1, s1, a2, s2, d), [
    p("rate", rate),
    p("a1", a1),
    p("sigma1", s1),
    p("a2", a2),
    p("sigma2", s2),
    p("d", d),
  ])
);

/** The made-up EEG the module asks about (a fixed seed: the same trace for the class). */
export const EEG_FIGURE: FigureSpec = {
  kind: "signal",
  parts: [{ type: "eeg", seed: 7 }],
  domain: [0, 4],
  yRange: [-1.4, 1.4],
  ticks: true,
};

/** The heartbeat, three beats at 60 per minute, with its bells drawn underneath. */
export const ECG_FIGURE: FigureSpec = {
  kind: "signal",
  parts: [ecg(1)],
  domain: [0, 3],
  yRange: [-0.4, 1.1],
  ticks: true,
};

/** How many numbers one heartbeat takes: three per bell, and the heart rate. */
export const ECG_NUMBERS = ECG_WAVES.length * 3 + 1;

const w = (key: string, values?: Words["values"]): Words =>
  values ? { key: `encoding.${key}`, values } : { key: `encoding.${key}` };
type Words = { key: string; values?: Record<string, string | number> };

/** Decoding, said in sentences: the order items of a question, from `q.<id>.steps.*`. */
function steps(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.steps.${id}`) }));
}

/** A true/false statement for the recap: two options, `true` and `false`. */
function trueFalse(id: string, answer: boolean): Question {
  return {
    kind: "choice",
    id,
    prompt: w(`q.${id}.prompt`),
    options: [
      { id: "true", words: { key: "question.true" } },
      { id: "false", words: { key: "question.false" } },
    ],
    answer: answer ? "true" : "false",
    explain: w(`q.${id}.explain`),
  };
}

/** Options from `q.<id>.options.*`. */
function options(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.options.${id}`) }));
}

/** The module, in order. */
export const ENCODING: (Step & { id: EncodingStepId })[] = [
  {
    id: "intro",
    figure: ECG_FIGURE,
    questions: [
      {
        kind: "choice",
        id: "introWhy",
        prompt: w("q.introWhy.prompt"),
        options: options("introWhy", ["pixels", "numbers", "words", "photo"]),
        answer: "numbers",
        explain: w("q.introWhy.explain"),
      },
    ],
  },
  {
    id: "line",
    reveal: true,
    gallery: LINE,
    questions: [
      {
        kind: "count",
        id: "lineCount",
        prompt: w("q.lineCount.prompt"),
        answer: 1,
        explain: w("q.lineCount.explain"),
      },
      {
        kind: "value",
        id: "lineValue",
        prompt: w("q.lineValue.prompt"),
        figures: [{ kind: "line", x: 6.5 }],
        labels: ["x"],
        answer: [6.5],
        tolerance: 0.25,
        sliders: [{ min: 0, max: 10, step: 0.5 }],
        model: "line",
        explain: w("q.lineValue.explain"),
      },
      {
        kind: "order",
        id: "lineDecode",
        prompt: w("q.lineDecode.prompt"),
        items: steps("lineDecode", ["axis", "measure", "dot"]),
        answer: ["axis", "measure", "dot"],
        explain: w("q.lineDecode.explain"),
      },
    ],
  },
  {
    id: "plane",
    reveal: true,
    gallery: PLANE,
    questions: [
      {
        kind: "count",
        id: "planeCount",
        prompt: w("q.planeCount.prompt"),
        answer: 2,
        explain: w("q.planeCount.explain"),
      },
      {
        kind: "value",
        id: "planeValue",
        prompt: w("q.planeValue.prompt"),
        figures: [{ kind: "plane", x: 3, y: 7 }],
        labels: ["x", "y"],
        answer: [3, 7],
        tolerance: 0.25,
        sliders: [
          { min: 0, max: 10, step: 0.5 },
          { min: 0, max: 10, step: 0.5 },
        ],
        model: "plane",
        explain: w("q.planeValue.explain"),
      },
      {
        kind: "match",
        id: "planeMatch",
        prompt: w("q.planeMatch.prompt"),
        items: [
          { id: "a", figure: PLANE[0].figure },
          { id: "b", figure: PLANE[1].figure },
          { id: "c", figure: PLANE[5].figure },
        ],
        slots: [
          { id: "s1", code: PLANE[1].code },
          { id: "s2", code: PLANE[5].code },
          { id: "s3", code: PLANE[0].code },
        ],
        answer: { a: "s3", b: "s1", c: "s2" },
        explain: w("q.planeMatch.explain"),
      },
    ],
  },
  {
    id: "bellPosition",
    reveal: true,
    gallery: BELL_POSITION,
    questions: [
      {
        kind: "count",
        id: "bellPositionCount",
        prompt: w("q.bellPositionCount.prompt"),
        answer: 1,
        explain: w("q.bellPositionCount.explain"),
      },
      {
        kind: "value",
        id: "bellPositionValue",
        prompt: w("q.bellPositionValue.prompt"),
        figures: [bellFigure(6.5, 1.5, 0.8)],
        labels: ["mu"],
        answer: [6.5],
        tolerance: 0.25,
        sliders: [{ min: 0, max: 10, step: 0.5 }],
        model: "bell",
        fixed: { a: 1.5, sigma: 0.8 },
        explain: w("q.bellPositionValue.explain"),
      },
      {
        kind: "order",
        id: "bellPositionSort",
        prompt: w("q.bellPositionSort.prompt"),
        items: [
          { id: "m7", figure: BELL_POSITION[1].figure },
          { id: "m2", figure: BELL_POSITION[5].figure },
          { id: "m5", figure: BELL_POSITION[3].figure },
          { id: "m85", figure: BELL_POSITION[4].figure },
        ],
        answer: ["m2", "m5", "m7", "m85"],
        explain: w("q.bellPositionSort.explain"),
      },
    ],
  },
  {
    id: "bellHeight",
    reveal: true,
    gallery: BELL_HEIGHT,
    questions: [
      {
        kind: "count",
        id: "bellHeightCount",
        prompt: w("q.bellHeightCount.prompt"),
        answer: 2,
        explain: w("q.bellHeightCount.explain"),
      },
      {
        kind: "value",
        id: "bellHeightValue",
        prompt: w("q.bellHeightValue.prompt"),
        figures: [bellFigure(3.5, 1.5, 0.8)],
        labels: ["mu", "a"],
        answer: [3.5, 1.5],
        tolerance: [0.25, 0.05],
        sliders: [
          { min: 0, max: 10, step: 0.5 },
          { min: 0, max: 2, step: 0.1 },
        ],
        model: "bell",
        fixed: { sigma: 0.8 },
        explain: w("q.bellHeightValue.explain"),
      },
      {
        kind: "match",
        id: "bellHeightMatch",
        prompt: w("q.bellHeightMatch.prompt"),
        items: [
          { id: "a", figure: BELL_HEIGHT[0].figure },
          { id: "b", figure: BELL_HEIGHT[5].figure },
          { id: "c", figure: BELL_HEIGHT[3].figure },
        ],
        slots: [
          { id: "s1", code: BELL_HEIGHT[5].code },
          { id: "s2", code: BELL_HEIGHT[3].code },
          { id: "s3", code: BELL_HEIGHT[0].code },
        ],
        answer: { a: "s3", b: "s1", c: "s2" },
        explain: w("q.bellHeightMatch.explain"),
      },
    ],
  },
  {
    id: "bellWidth",
    reveal: true,
    gallery: BELL_WIDTH,
    playground: {
      id: "bellPlay",
      model: "bell",
      target: [p("mu", 6), p("a", 1.5), p("sigma", 0.7)],
      sliders: [
        { name: "mu", min: 0, max: 10, step: 0.5 },
        { name: "a", min: 0, max: 2, step: 0.1 },
        { name: "sigma", min: 0.2, max: 3, step: 0.1 },
      ],
      domain: SIGNAL_RANGE,
      yRange: BELL_Y,
    },
    questions: [
      {
        kind: "count",
        id: "bellWidthCount",
        prompt: w("q.bellWidthCount.prompt"),
        answer: 3,
        explain: w("q.bellWidthCount.explain"),
      },
      {
        kind: "value",
        id: "bellWidthValue",
        prompt: w("q.bellWidthValue.prompt"),
        figures: [bellFigure(6, 1, 0.5)],
        labels: ["mu", "a", "sigma"],
        answer: [6, 1, 0.5],
        tolerance: [0.25, 0.05, 0.05],
        sliders: [
          { min: 0, max: 10, step: 0.5 },
          { min: 0, max: 2, step: 0.1 },
          { min: 0.1, max: 3, step: 0.1 },
        ],
        model: "bell",
        explain: w("q.bellWidthValue.explain"),
      },
      {
        kind: "order",
        id: "bellWidthSort",
        prompt: w("q.bellWidthSort.prompt"),
        items: [
          { id: "s2", figure: bellFigure(5, 1.5, 2) },
          { id: "s03", figure: bellFigure(5, 1.5, 0.3) },
          { id: "s1", figure: bellFigure(5, 1.5, 1) },
          { id: "s06", figure: bellFigure(5, 1.5, 0.6) },
        ],
        answer: ["s03", "s06", "s1", "s2"],
        explain: w("q.bellWidthSort.explain"),
      },
      {
        kind: "order",
        id: "bellDecode",
        prompt: w("q.bellDecode.prompt"),
        items: steps("bellDecode", ["read", "centre", "height", "spread"]),
        answer: ["read", "centre", "height", "spread"],
        explain: w("q.bellDecode.explain"),
      },
    ],
  },
  {
    id: "waves",
    reveal: true,
    gallery: WAVES,
    playground: {
      id: "wavePlay",
      model: "wave",
      target: [p("f", 1.5), p("a", 1.2)],
      sliders: [
        { name: "f", min: 0.5, max: 4, step: 0.5 },
        { name: "a", min: 0, max: 1.6, step: 0.1 },
      ],
      domain: [0, 2],
      yRange: [-1.8, 1.8],
    },
    questions: [
      {
        kind: "count",
        id: "wavesCount",
        prompt: w("q.wavesCount.prompt"),
        answer: 2,
        explain: w("q.wavesCount.explain"),
      },
      {
        kind: "value",
        id: "wavesValue",
        prompt: w("q.wavesValue.prompt"),
        figures: [{ ...waveFigure(2, 1.5), ticks: true }],
        labels: ["f", "a"],
        answer: [2, 1.5],
        tolerance: [0.1, 0.05],
        sliders: [
          { min: 0.5, max: 4, step: 0.5 },
          { min: 0, max: 2, step: 0.1 },
        ],
        model: "wave",
        explain: w("q.wavesValue.explain"),
      },
      {
        kind: "match",
        id: "wavesMatch",
        prompt: w("q.wavesMatch.prompt"),
        items: [
          { id: "a", figure: WAVES[1].figure },
          { id: "b", figure: WAVES[2].figure },
          { id: "c", figure: WAVES[7].figure },
        ],
        slots: [
          { id: "s1", code: WAVES[7].code },
          { id: "s2", code: WAVES[1].code },
          { id: "s3", code: WAVES[2].code },
        ],
        answer: { a: "s2", b: "s3", c: "s1" },
        explain: w("q.wavesMatch.explain"),
      },
    ],
  },
  {
    id: "train",
    reveal: true,
    gallery: TRAINS,
    playground: {
      id: "trainPlay",
      model: "train",
      target: [p("rate", 2), p("a", 1.5), p("sigma", 0.05)],
      sliders: [
        { name: "rate", min: 0.5, max: 4, step: 0.5 },
        { name: "a", min: 0, max: 2, step: 0.1 },
        { name: "sigma", min: 0.02, max: 0.3, step: 0.01 },
      ],
      domain: [0, 3],
      yRange: [-0.1, 2.2],
    },
    questions: [
      {
        kind: "count",
        id: "trainCount",
        prompt: w("q.trainCount.prompt"),
        answer: 3,
        explain: w("q.trainCount.explain"),
      },
      {
        kind: "value",
        id: "trainValue",
        prompt: w("q.trainValue.prompt"),
        figures: [trainFigure(2, 1.5, 0.1)],
        labels: ["rate", "a", "sigma"],
        answer: [2, 1.5, 0.1],
        tolerance: [0.1, 0.05, 0.01],
        sliders: [
          { min: 0.5, max: 4, step: 0.5 },
          { min: 0, max: 2, step: 0.1 },
          { min: 0.02, max: 0.4, step: 0.02 },
        ],
        model: "train",
        explain: w("q.trainValue.explain"),
      },
      {
        kind: "choice",
        id: "trainRate",
        prompt: w("q.trainRate.prompt"),
        options: [
          { id: "one", figure: trainFigure(1, 1.5, 0.08) },
          { id: "three", figure: trainFigure(3, 1, 0.05) },
          { id: "two", figure: trainFigure(2, 2, 0.08) },
          { id: "tall", figure: trainFigure(1, 2, 0.2) },
        ],
        answer: "three",
        explain: w("q.trainRate.explain"),
      },
    ],
  },
  {
    id: "twoBells",
    reveal: true,
    gallery: TWO,
    questions: [
      {
        kind: "count",
        id: "twoBellsCount",
        prompt: w("q.twoBellsCount.prompt"),
        answer: 6,
        explain: w("q.twoBellsCount.explain"),
      },
      {
        kind: "value",
        id: "twoBellsValue",
        prompt: w("q.twoBellsValue.prompt"),
        figures: [twoBellsFigure(1, 1, 0.08, -0.6, 0.08, 0.3)],
        labels: ["rate", "a1", "sigma1", "a2", "sigma2", "d"],
        answer: [1, 1, 0.08, -0.6, 0.08, 0.3],
        tolerance: [0.1, 0.05, 0.01, 0.05, 0.01, 0.025],
        sliders: [
          { min: 0.5, max: 3, step: 0.5 },
          { min: 0, max: 1.5, step: 0.1 },
          { min: 0.02, max: 0.3, step: 0.02 },
          { min: -1.5, max: 1.5, step: 0.1 },
          { min: 0.02, max: 0.3, step: 0.02 },
          { min: 0.05, max: 0.6, step: 0.05 },
        ],
        model: "twoBells",
        explain: w("q.twoBellsValue.explain"),
      },
      {
        kind: "choice",
        id: "twoBellsSign",
        prompt: w("q.twoBellsSign.prompt"),
        options: options("twoBellsSign", [
          "negative",
          "flip",
          "subtract",
          "second",
        ]),
        answer: "negative",
        explain: w("q.twoBellsSign.explain"),
      },
    ],
  },
  {
    id: "ecg",
    lab: "ecg",
    questions: [
      {
        kind: "count",
        id: "ecgCount",
        prompt: w("q.ecgCount.prompt"),
        answer: ECG_NUMBERS,
        explain: w("q.ecgCount.explain"),
      },
      {
        kind: "choice",
        id: "ecgTallest",
        prompt: w("q.ecgTallest.prompt"),
        options: options("ecgTallest", ["P1", "R", "T1", "S"]),
        answer: "R",
        explain: w("q.ecgTallest.explain"),
      },
      {
        kind: "order",
        id: "ecgDecode",
        prompt: w("q.ecgDecode.prompt"),
        items: steps("ecgDecode", ["read", "bells", "sum", "repeat"]),
        answer: ["read", "bells", "sum", "repeat"],
        explain: w("q.ecgDecode.explain"),
      },
    ],
  },
  {
    id: "eeg",
    figure: EEG_FIGURE,
    questions: [
      {
        kind: "choice",
        id: "eegHow",
        prompt: w("q.eegHow.prompt"),
        options: options("eegHow", ["bells", "waves", "learn", "pixels"]),
        answer: "learn",
        explain: w("q.eegHow.explain"),
      },
    ],
  },
  {
    id: "vae",
    figure: { kind: "vae", latent: 8 },
    questions: [
      {
        kind: "count",
        id: "vaeCount",
        prompt: w("q.vaeCount.prompt"),
        answer: 8,
        explain: w("q.vaeCount.explain"),
      },
      {
        kind: "order",
        id: "vaeSteps",
        prompt: w("q.vaeSteps.prompt"),
        items: steps("vaeSteps", [
          "encode",
          "bells",
          "draw",
          "decode",
          "compare",
        ]),
        answer: ["encode", "bells", "draw", "decode", "compare"],
        explain: w("q.vaeSteps.explain"),
      },
    ],
  },
  {
    id: "recap",
    reveal: true,
    questions: [
      {
        kind: "match",
        id: "recapMatch",
        prompt: w("q.recapMatch.prompt"),
        items: [
          { id: "line", figure: LINE[2].figure },
          { id: "plane", figure: PLANE[2].figure },
          { id: "bell", figure: BELL_WIDTH[0].figure },
          { id: "two", figure: TWO[0].figure },
          { id: "ecg", figure: ECG_FIGURE },
        ],
        slots: [
          { id: "n3", count: 3 },
          { id: "n1", count: 1 },
          { id: "n25", count: ECG_NUMBERS },
          { id: "n2", count: 2 },
          { id: "n6", count: 6 },
        ],
        answer: { line: "n1", plane: "n2", bell: "n3", two: "n6", ecg: "n25" },
        explain: w("q.recapMatch.explain"),
      },
      trueFalse("enTfChanges", true),
      trueFalse("enTfDots", false),
      trueFalse("enTfDecode", true),
      trueFalse("enTfEeg", false),
    ],
  },
];
