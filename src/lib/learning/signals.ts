/**
 * The signals the Learning modules draw, as pure functions of a few numbers.
 *
 * Every figure of the Encoding module is generated here rather than shipped as a
 * picture, for the module's own point: a picture of a bell or of a heartbeat *is* the
 * handful of numbers below it. The same numbers that draw a figure are the answer to the
 * question asked about it, so a figure and its question can never disagree.
 *
 * Units are the figure's own: `x` is "time" (seconds for the waves and the heartbeat),
 * heights are unitless. Nothing here touches the DOM.
 */

/** A gaussian bell: `a * exp(-(x - mu)^2 / (2 sigma^2))`. `a` may be negative. */
export interface Bell {
  mu: number;
  sigma: number;
  a: number;
}

/** A sine or cosine wave: `a * fn(2 pi f x + phase)`, `f` in cycles per unit of x. */
export interface Wave {
  fn: "sin" | "cos";
  f: number;
  a: number;
  phase?: number;
}

/**
 * The same bells again and again, `rate` times per unit of x: a pulse train, and with the
 * right bells a heartbeat. Each bell's `mu` is its place inside one beat, from the beat's
 * start; beats start at `start + k / rate`.
 */
export interface Train {
  rate: number;
  bells: Bell[];
  start?: number;
}

/** One ingredient of a drawn signal; a figure adds its parts up. */
export type Part =
  | ({ type: "bell" } & Bell)
  | ({ type: "wave" } & Wave)
  | ({ type: "train" } & Train)
  | { type: "eeg"; seed: number };

/** The value of one bell at `x`. */
export function bellAt(b: Bell, x: number): number {
  const d = (x - b.mu) / b.sigma;
  return b.a * Math.exp(-0.5 * d * d);
}

/** The value of one wave at `x`. */
export function waveAt(w: Wave, x: number): number {
  const angle = 2 * Math.PI * w.f * x + (w.phase ?? 0);
  return w.a * (w.fn === "sin" ? Math.sin(angle) : Math.cos(angle));
}

/**
 * The value of a train at `x`: the beat `x` falls in and its two neighbours on each
 * side, so a bell that spills over the edge of its beat is still drawn whole (bells are
 * narrow next to a beat; five beats is plenty).
 */
export function trainAt(t: Train, x: number): number {
  const period = 1 / t.rate;
  const start = t.start ?? 0;
  const beat = Math.floor((x - start) / period);
  let y = 0;
  for (let k = beat - 2; k <= beat + 2; k++) {
    const at = start + k * period;
    for (const b of t.bells) y += bellAt(b, x - at);
  }
  return y;
}

/** A small, fast, seeded generator (mulberry32): the same seed draws the same EEG. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sines one EEG seed is made of: computed once per seed. */
const EEG_CACHE = new Map<number, Wave[]>();

/**
 * A made-up EEG: forty sines from 1 to 30 Hz with a 1/f fall-off and random phases,
 * plus an alpha rhythm (near 10 Hz) that waxes and wanes. Not a recording: it only has
 * to *look* like one, a signal with no obvious recipe, which is the question the module
 * asks of it.
 */
export function eegWaves(seed: number): Wave[] {
  const cached = EEG_CACHE.get(seed);
  if (cached) return cached;
  const rand = seeded(seed);
  const waves: Wave[] = [];
  for (let i = 0; i < 40; i++) {
    const f = 1 + rand() * 29;
    waves.push({
      fn: "sin",
      f,
      a: (0.55 / Math.pow(f, 0.75)) * (0.5 + rand()),
      phase: rand() * 2 * Math.PI,
    });
  }
  // alpha: two close frequencies beat against each other, so it comes and goes
  waves.push({ fn: "sin", f: 10, a: 0.18, phase: rand() * 6 });
  waves.push({ fn: "sin", f: 10.6, a: 0.16, phase: rand() * 6 });
  EEG_CACHE.set(seed, waves);
  return waves;
}

/** The value of one part at `x`. */
export function partAt(p: Part, x: number): number {
  switch (p.type) {
    case "bell":
      return bellAt(p, x);
    case "wave":
      return waveAt(p, x);
    case "train":
      return trainAt(p, x);
    case "eeg":
      return eegWaves(p.seed).reduce((y, w) => y + waveAt(w, x), 0);
  }
}

/** The value of the sum of `parts` at `x`. */
export function valueAt(parts: Part[], x: number): number {
  let y = 0;
  for (const p of parts) y += partAt(p, x);
  return y;
}

/** `n` evenly spaced samples of the sum of `parts` over `[x0, x1]`, ends included. */
export function sample(
  parts: Part[],
  [x0, x1]: [number, number],
  n: number
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const xi = x0 + ((x1 - x0) * i) / (n - 1);
    x.push(xi);
    y.push(valueAt(parts, xi));
  }
  return { x, y };
}

/**
 * Root mean square distance between two signals over `[x0, x1]`: how far a
 * reconstruction is from the original, the playground's score.
 */
export function rmsError(
  a: Part[],
  b: Part[],
  domain: [number, number],
  n = 200
): number {
  const sa = sample(a, domain, n).y;
  const sb = sample(b, domain, n).y;
  let s = 0;
  for (let i = 0; i < n; i++) s += (sa[i] - sb[i]) ** 2;
  return Math.sqrt(s / n);
}

/** The eight waves of one heartbeat, in the order they happen. */
export const ECG_WAVES = ["P1", "P2", "Q", "R", "S", "T1", "T2", "U"] as const;
export type EcgWave = (typeof ECG_WAVES)[number];

/**
 * One heartbeat as eight bells (position in seconds from the beat's start, width,
 * height in millivolts, roughly): the P wave (the atria) in two halves, the Q-R-S spike
 * (the ventricles), the T wave (their recovery) in two halves, and the small U wave.
 * Real ECG models (McSharry et al. 2003) use the same idea with five.
 */
export const ECG_BEAT: Record<EcgWave, Bell> = {
  P1: { mu: 0.1, sigma: 0.022, a: 0.09 },
  P2: { mu: 0.15, sigma: 0.022, a: 0.11 },
  Q: { mu: 0.265, sigma: 0.009, a: -0.12 },
  R: { mu: 0.3, sigma: 0.011, a: 1.0 },
  S: { mu: 0.335, sigma: 0.011, a: -0.26 },
  T1: { mu: 0.52, sigma: 0.045, a: 0.22 },
  T2: { mu: 0.6, sigma: 0.04, a: 0.14 },
  U: { mu: 0.73, sigma: 0.03, a: 0.04 },
};

/** A heartbeat train at `rate` beats per second, with only the waves in `keep`. */
export function ecg(
  rate = 1,
  keep: readonly EcgWave[] = ECG_WAVES
): Extract<Part, { type: "train" }> {
  return { type: "train", rate, bells: keep.map((w) => ECG_BEAT[w]) };
}
