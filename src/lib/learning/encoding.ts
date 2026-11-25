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

/** One screen of a module. */
export interface Step {
  id: EncodingStepId;
  /** Nine pictures of one family, their codes hidden until asked for. */
  gallery?: Example[];
  /** One larger picture. */
  figure?: FigureSpec;
  /** The heartbeat with its eight bells, each switched on and off. */
  explorer?: "ecg";
  playground?: Playground;
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
  const first = 0.25 / rate;
  return {
    kind: "signal",
    parts: [
      {
        type: "train",
        rate,
        bells: [
          { mu: first, a: a1, sigma: sigma1 },
          { mu: first + d, a: a2, sigma: sigma2 },
        ],
      },
    ],
    domain: [0, 3],
    yRange: [-1.3, 1.6],
  };
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

/** Options from `q.<id>.options.*`. */
function options(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.options.${id}`) }));
}

/** The module, in order. */
export const ENCODING: Step[] = [
  {
    id: "intro",
    figure: ECG_FIGURE,
    questions: [
      {
        kind: "choice",
        id: "introWhy",
        prompt: w("q.introWhy.prompt"),
        options: options("introWhy", ["pixels", "numbers", "words"]),
        answer: "numbers",
        explain: w("q.introWhy.explain"),
      },
    ],
  },
  {
    id: "line",
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
        tolerance: 0.1,
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
        kind: "choice",
        id: "trainRate",
        prompt: w("q.trainRate.prompt"),
        options: [
          { id: "one", figure: trainFigure(1, 1.5, 0.08) },
          { id: "three", figure: trainFigure(3, 1, 0.05) },
          { id: "two", figure: trainFigure(2, 2, 0.08) },
        ],
        answer: "three",
        explain: w("q.trainRate.explain"),
      },
    ],
  },
  {
    id: "twoBells",
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
        kind: "choice",
        id: "twoBellsSign",
        prompt: w("q.twoBellsSign.prompt"),
        options: options("twoBellsSign", ["negative", "flip", "subtract"]),
        answer: "negative",
        explain: w("q.twoBellsSign.explain"),
      },
    ],
  },
  {
    id: "ecg",
    explorer: "ecg",
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
      {
        kind: "order",
        id: "recapSteps",
        prompt: w("q.recapSteps.prompt"),
        items: steps("recapSteps", ["recipe", "count", "encode", "decode"]),
        answer: ["recipe", "count", "encode", "decode"],
        explain: w("q.recapSteps.explain"),
      },
    ],
  },
];
