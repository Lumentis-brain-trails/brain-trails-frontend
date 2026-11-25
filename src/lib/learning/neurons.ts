/**
 * The arithmetic of the Neural Networks module: one artificial neuron, a line that splits
 * dots, a neuron that learns by gradient descent, and a small network that learns to read
 * handwritten digits, all small enough to run in the browser while the class watches.
 *
 * Pure functions over plain arrays; every random choice is seeded (`seeded`), so the
 * same class sees the same dots, the same starting weights and the same training run.
 */
import { seeded } from "@/lib/learning/signals";

/** A neuron with two inputs: weights `w1`, `w2` and bias `b` (minus the threshold). */
export interface Neuron2 {
  w1: number;
  w2: number;
  b: number;
}

/** The weighted sum a neuron computes before deciding. */
export function weightedSum(n: Neuron2, x1: number, x2: number): number {
  return n.w1 * x1 + n.w2 * x2 + n.b;
}

/** Fires (1) when the weighted sum is above zero, stays quiet (0) otherwise. */
export function fires(n: Neuron2, x1: number, x2: number): 0 | 1 {
  return weightedSum(n, x1, x2) > 0 ? 1 : 0;
}

/** The four input pairs of a truth table, in reading order. */
export const PAIRS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

/** The logic gates the module asks a neuron to be. */
export type Gate = "and" | "or" | "xor";

/** What each gate answers for `PAIRS`, in order. */
export const GATES: Record<Gate, (0 | 1)[]> = {
  and: [0, 0, 0, 1],
  or: [0, 1, 1, 1],
  xor: [0, 1, 1, 0],
};

/** A neuron's answers for `PAIRS`. */
export function truthTable(n: Neuron2): (0 | 1)[] {
  return PAIRS.map(([a, b]) => fires(n, a, b));
}

/** Whether a neuron computes `gate`. */
export function computes(n: Neuron2, gate: Gate): boolean {
  return truthTable(n).every((v, i) => v === GATES[gate][i]);
}

/** A dot to classify: where it is, and which group (0 or 1) it belongs to. */
export interface Dot {
  x: number;
  y: number;
  label: 0 | 1;
}

/**
 * Dots in four clouds, one around each corner of the unit square, labelled by `gate`:
 * the truth table drawn as a picture, so a line that splits the dots is a neuron that
 * computes the gate.
 */
export function gateDots(gate: Gate, perCorner = 6, seed = 3): Dot[] {
  const rand = seeded(seed);
  const dots: Dot[] = [];
  PAIRS.forEach(([cx, cy], i) => {
    for (let k = 0; k < perCorner; k++)
      dots.push({
        x: cx + (rand() - 0.5) * 0.3,
        y: cy + (rand() - 0.5) * 0.3,
        label: GATES[gate][i],
      });
  });
  return dots;
}

/** Two clouds of dots, one per group, that a single line can split. */
export function twoGroups(n = 16, seed = 11): Dot[] {
  const rand = seeded(seed);
  const dots: Dot[] = [];
  for (let i = 0; i < n; i++) {
    const label = (i % 2) as 0 | 1;
    const [cx, cy] = label ? [0.75, 0.7] : [0.25, 0.3];
    dots.push({
      x: cx + (rand() - 0.5) * 0.4,
      y: cy + (rand() - 0.5) * 0.4,
      label,
    });
  }
  return dots;
}

/** How many dots a neuron puts on the right side of its line. */
export function correctCount(n: Neuron2, dots: Dot[]): number {
  return dots.filter((d) => fires(n, d.x, d.y) === d.label).length;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * The average error of a soft neuron (`sigmoid(w1 x + w2 y + b)`) on `dots`: the
 * cross-entropy, the number training pushes down.
 */
export function loss(n: Neuron2, dots: Dot[]): number {
  let s = 0;
  for (const d of dots) {
    const p = Math.min(
      Math.max(sigmoid(weightedSum(n, d.x, d.y)), 1e-9),
      1 - 1e-9
    );
    s -= d.label ? Math.log(p) : Math.log(1 - p);
  }
  return s / dots.length;
}

/**
 * One step of gradient descent on `loss`: each dot's error (`output - label`) flows back
 * to each weight, multiplied by the input that weight listens to, and every weight moves
 * a little (`rate`) against its share of the error. That is backpropagation for a
 * network of one neuron.
 */
export function learnStep(n: Neuron2, dots: Dot[], rate = 1): Neuron2 {
  let g1 = 0;
  let g2 = 0;
  let gb = 0;
  for (const d of dots) {
    const err = sigmoid(weightedSum(n, d.x, d.y)) - d.label;
    g1 += err * d.x;
    g2 += err * d.y;
    gb += err;
  }
  const k = rate / dots.length;
  return { w1: n.w1 - k * g1, w2: n.w2 - k * g2, b: n.b - k * gb };
}

/**
 * The hand-wired network that computes XOR with one hidden layer: the first hidden neuron
 * is OR, the second NAND (not both), and the output fires when both do.
 */
export const XOR_NET = {
  hidden: [
    { w1: 1, w2: 1, b: -0.5 },
    { w1: -1, w2: -1, b: 1.5 },
  ] as Neuron2[],
  out: { w1: 1, w2: 1, b: -1.5 } as Neuron2,
};

/** The hidden values and the output of `XOR_NET` for one input pair. */
export function xorForward(
  x1: number,
  x2: number
): {
  hidden: [0 | 1, 0 | 1];
  out: 0 | 1;
} {
  const h1 = fires(XOR_NET.hidden[0], x1, x2);
  const h2 = fires(XOR_NET.hidden[1], x1, x2);
  return { hidden: [h1, h2], out: fires(XOR_NET.out, h1, h2) };
}

/**
 * How many numbers a fully connected network learns: for every layer after the first,
 * one weight per incoming connection and one bias per neuron.
 */
export function parameterCount(layers: number[]): number {
  let n = 0;
  for (let i = 1; i < layers.length; i++)
    n += layers[i - 1] * layers[i] + layers[i];
  return n;
}

/* ---- digits ------------------------------------------------------------ */

export const DIGIT_W = 5;
export const DIGIT_H = 7;

/** The ten digits as 5x7 pictures, `#` for ink. */
export const DIGIT_ROWS: string[][] = [
  [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
  ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
];

/** A digit's pixels, row by row, 1 for ink. */
export function digitPixels(d: number): number[] {
  return DIGIT_ROWS[d].flatMap((row) =>
    [...row].map((c) => (c === "#" ? 1 : 0))
  );
}

/** A labelled picture for training. */
export interface Sample {
  pixels: number[];
  label: number;
}

/**
 * `perDigit` "handwritten" copies of each digit: the clean picture with a few pixels
 * flipped at random (`noise` is the chance per pixel), so no two are the same and the
 * network has to learn the shape rather than one picture.
 */
export function digitSamples(
  perDigit: number,
  noise = 0.08,
  seed = 5
): Sample[] {
  const rand = seeded(seed);
  const out: Sample[] = [];
  for (let k = 0; k < perDigit; k++)
    for (let d = 0; d < 10; d++)
      out.push({
        label: d,
        pixels: digitPixels(d).map((p) => (rand() < noise ? 1 - p : p)),
      });
  return out;
}

/**
 * A network with one hidden layer of sigmoid neurons and a softmax output: `w1[h][i]`
 * from input i to hidden h, `w2[o][h]` from hidden h to output o.
 */
export interface Mlp {
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
}

/** A network of the given sizes with small random weights (seeded). */
export function makeMlp(
  inputs: number,
  hidden: number,
  outputs: number,
  seed = 1
): Mlp {
  const rand = seeded(seed);
  const r = (fan: number) => (rand() * 2 - 1) / Math.sqrt(fan);
  return {
    w1: Array.from({ length: hidden }, () =>
      Array.from({ length: inputs }, () => r(inputs))
    ),
    b1: Array(hidden).fill(0),
    w2: Array.from({ length: outputs }, () =>
      Array.from({ length: hidden }, () => r(hidden))
    ),
    b2: Array(outputs).fill(0),
  };
}

/** The hidden values and the output probabilities for one picture. */
export function forward(
  net: Mlp,
  x: number[]
): { hidden: number[]; probs: number[] } {
  const hidden = net.w1.map((row, h) =>
    sigmoid(row.reduce((s, w, i) => s + w * x[i], net.b1[h]))
  );
  const z = net.w2.map((row, o) =>
    row.reduce((s, w, h) => s + w * hidden[h], net.b2[o])
  );
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return { hidden, probs: e.map((v) => v / sum) };
}

/** The digit the network believes it sees. */
export function predict(net: Mlp, x: number[]): number {
  const { probs } = forward(net, x);
  return probs.indexOf(Math.max(...probs));
}

/** The share of `samples` the network reads right, from 0 to 1. */
export function accuracy(net: Mlp, samples: Sample[]): number {
  if (!samples.length) return 0;
  return (
    samples.filter((s) => predict(net, s.pixels) === s.label).length /
    samples.length
  );
}

/**
 * One pass over `samples` (an epoch), one picture at a time: forward, compare with the
 * label, send the error back through the output weights to the hidden layer
 * (backpropagation), and nudge every weight against its share of the error. Returns a
 * new network; the old one is untouched.
 */
export function trainEpoch(net: Mlp, samples: Sample[], rate = 0.5): Mlp {
  const w1 = net.w1.map((r) => [...r]);
  const b1 = [...net.b1];
  const w2 = net.w2.map((r) => [...r]);
  const b2 = [...net.b2];
  const cur: Mlp = { w1, b1, w2, b2 };
  for (const s of samples) {
    const { hidden, probs } = forward(cur, s.pixels);
    const dOut = probs.map((p, o) => p - (o === s.label ? 1 : 0));
    const dHidden = hidden.map(
      (h, j) => dOut.reduce((acc, d, o) => acc + d * w2[o][j], 0) * h * (1 - h)
    );
    for (let o = 0; o < w2.length; o++) {
      for (let j = 0; j < hidden.length; j++)
        w2[o][j] -= rate * dOut[o] * hidden[j];
      b2[o] -= rate * dOut[o];
    }
    for (let j = 0; j < w1.length; j++) {
      for (let i = 0; i < s.pixels.length; i++)
        w1[j][i] -= rate * dHidden[j] * s.pixels[i];
      b1[j] -= rate * dHidden[j];
    }
  }
  return cur;
}
