/**
 * The Learning modules' figures and questions, as plain data.
 *
 * Everything here is JSON: a figure is a spec drawn by `LearningFigure`, a question names
 * its words by message key (under `learning.` in `messages/*.json`) and its pictures by
 * spec. That keeps a question portable: the live class game can send one over the wire,
 * show it on the teacher's screen and check every student's vote with `isCorrect`, the
 * same function the module uses.
 */
import type { Part } from "@/lib/learning/signals";

/** Words from the catalogue: a key under `learning.`, with its ICU arguments. */
export interface Words {
  key: string;
  values?: Record<string, string | number>;
}

/** A parameter's name: drawn as its symbol (`PARAM_SYMBOL`), the same in every language. */
export type ParamName =
  | "x"
  | "y"
  | "mu"
  | "a"
  | "sigma"
  | "f"
  | "rate"
  | "a1"
  | "sigma1"
  | "a2"
  | "sigma2"
  | "d";

/**
 * How a parameter is written: mathematics' own letters, so not translated (an Italian
 * textbook writes mu and sigma the same way).
 */
export const PARAM_SYMBOL: Record<ParamName, string> = {
  x: "x",
  y: "y",
  mu: "μ",
  a: "A",
  sigma: "σ",
  f: "f",
  rate: "f",
  a1: "A₁",
  sigma1: "σ₁",
  a2: "A₂",
  sigma2: "σ₂",
  d: "d",
};

/** One parameter and its value: a picture's code is a list of these. */
export interface Param {
  name: ParamName;
  value: number;
}

/** A code written out: `μ = 3, A = 1.5`. */
export function formatCode(code: Param[]): string {
  return code
    .map((p) => `${PARAM_SYMBOL[p.name]} = ${round(p.value)}`)
    .join(", ");
}

/** A value as a person would write it: at most three decimals, no trailing zeros. */
export function round(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** The parts of an artificial neuron a figure can highlight. */
export type ArtificialPart = "inputs" | "weights" | "sum" | "fires";
/** The parts of a biological neuron a figure can highlight. */
export type BioPart = "dendrites" | "body" | "axon" | "synapse";

/** What a figure draws. */
export type FigureSpec =
  /** One point on a number line from `range[0]` to `range[1]`, ticks every unit. */
  | { kind: "line"; x: number; range?: [number, number] }
  /** One point on a square grid. */
  | { kind: "plane"; x: number; y: number; range?: [number, number] }
  /**
   * A signal: the sum of `parts` over `domain`, on a vertical scale of `yRange`.
   * `showParts` also draws each part on its own, faint; `ghost` draws another signal
   * behind it, dashed (the original a reconstruction is aiming at); `ticks` labels the
   * horizontal axis every unit.
   */
  | {
      kind: "signal";
      parts: Part[];
      domain: [number, number];
      yRange: [number, number];
      showParts?: boolean;
      ghost?: Part[];
      ticks?: boolean;
    }
  /** The variational autoencoder's diagram: signal, encoder, `latent` numbers, decoder. */
  | { kind: "vae"; latent: number }
  /** Dots of two groups on the unit square, and a neuron's line if `line` is given. */
  | {
      kind: "dots";
      dots: { x: number; y: number; label: 0 | 1 }[];
      line?: { w1: number; w2: number; b: number };
    }
  /** A fully connected network: how many neurons in each layer, inputs first. */
  | { kind: "network"; layers: number[] }
  /** A small picture of pixels (`width` per row, 1 for ink), such as a 5x7 digit. */
  | { kind: "pixels"; pixels: number[]; width: number }
  /** One artificial neuron with its parts named: inputs, weights, sum, firing. */
  | { kind: "neuron"; highlight?: ArtificialPart }
  /** A biological neuron, sketched, with its parts named or one of them highlighted. */
  | { kind: "bioNeuron"; highlight?: BioPart }
  /** Plasticity over a lifetime: synapse count and ease of change, birth to 90. */
  | { kind: "lifespan" };

/** A picture with its code: what the gallery shows and the matching game drags. */
export interface Example {
  id: string;
  figure: FigureSpec;
  code: Param[];
}

/** A thing to pick or to put in order: words, a picture, or both. */
export interface Item {
  id: string;
  words?: Words;
  figure?: FigureSpec;
}

/**
 * A question. `prompt` asks it; `explain` is shown once it has been answered (right or
 * wrong), because the point is the reasoning, not the score.
 *
 * - `count`: a whole number (how many parameters?).
 * - `value`: one number per label (what are the parameters of this picture?), each
 *   within `tolerance`.
 * - `choice`: one of `options`.
 * - `order`: every item, in the right order (the steps of a decoding; pictures from the
 *   smallest parameter to the largest).
 * - `match`: every item into one of `slots` (pictures onto their codes).
 */
export type Question =
  | {
      kind: "count";
      id: string;
      prompt: Words;
      figures?: FigureSpec[];
      answer: number;
      explain: Words;
    }
  | {
      kind: "value";
      id: string;
      prompt: Words;
      figures?: FigureSpec[];
      labels: ParamName[];
      answer: number[];
      tolerance: number;
      explain: Words;
    }
  | {
      kind: "choice";
      id: string;
      prompt: Words;
      figures?: FigureSpec[];
      options: Item[];
      answer: string;
      explain: Words;
    }
  | {
      kind: "order";
      id: string;
      prompt: Words;
      items: Item[];
      /** The items' ids, first to last. */
      answer: string[];
      explain: Words;
    }
  | {
      kind: "match";
      id: string;
      prompt: Words;
      items: Item[];
      /**
       * A slot shows a code (`μ = 3, A = 1`), a count of numbers ("3 numbers") or
       * words (a name to match a name to).
       */
      slots: { id: string; code?: Param[]; count?: number; words?: Words }[];
      /** Item id -> slot id. */
      answer: Record<string, string>;
      explain: Words;
    };

/** What a person answers, by kind of question. */
export type Answer =
  | { kind: "count"; value: number }
  | { kind: "value"; values: number[] }
  | { kind: "choice"; id: string }
  | { kind: "order"; ids: string[] }
  | { kind: "match"; placed: Record<string, string> };

/**
 * Whether `answer` answers `question`. A wrong kind of answer is simply wrong; a value
 * answer needs every value within the question's tolerance, a match every item placed.
 */
export function isCorrect(question: Question, answer: Answer): boolean {
  switch (question.kind) {
    case "count":
      return answer.kind === "count" && answer.value === question.answer;
    case "value":
      return (
        answer.kind === "value" &&
        answer.values.length === question.answer.length &&
        question.answer.every(
          (v, i) =>
            Number.isFinite(answer.values[i]) &&
            Math.abs(answer.values[i] - v) <= question.tolerance + 1e-9
        )
      );
    case "choice":
      return answer.kind === "choice" && answer.id === question.answer;
    case "order":
      return (
        answer.kind === "order" &&
        answer.ids.length === question.answer.length &&
        question.answer.every((id, i) => answer.ids[i] === id)
      );
    case "match":
      return (
        answer.kind === "match" &&
        Object.entries(question.answer).every(
          ([item, slot]) => answer.placed[item] === slot
        )
      );
  }
}

/**
 * `items` in an order that depends only on `seed`: the same shuffle on the server and in
 * the browser (no hydration mismatch) and on every student's screen, and never the
 * answer's own order when there is another.
 */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) {
    out.push(out.shift() as T);
  }
  return out;
}

/** Every message key a question names, for the test that keeps the catalogue whole. */
export function wordsOf(question: Question): Words[] {
  const words = [question.prompt, question.explain];
  if (question.kind === "choice")
    for (const o of question.options) if (o.words) words.push(o.words);
  if (question.kind === "order" || question.kind === "match")
    for (const i of question.items) if (i.words) words.push(i.words);
  if (question.kind === "match")
    for (const s of question.slots) if (s.words) words.push(s.words);
  return words;
}
