/**
 * The spectrum of one window of one channel, for the neurofeedback block (backend V4-0009).
 *
 * Deliberately small and exact rather than fast-and-clever: the backend replays this
 * computation from the uploaded EEG (`pipeline/features/neurofeedback.py`) and the two
 * must agree to the last digits the golden file keeps, so every step is the textbook
 * one - mean removed, symmetric Hann window (numpy's `hanning`), radix-2 FFT, one-sided
 * power `|X[k]|^2`. Scaling is left out on purpose: every quantity the block uses is a
 * share or a ratio of powers from the same window, where a constant factor cancels.
 *
 * Bands follow the pipeline's (`pipeline/features/spectral.py`): `[low, high)` Hz, so a
 * trained band is the band the review page reports. SMR is the one addition.
 */

/** `[low, high)` in Hz. */
export type Band = readonly [number, number];

export const BANDS = {
  theta: [4, 8],
  alpha: [8, 13],
  smr: [12, 15],
  beta: [13, 30],
} as const satisfies Record<string, Band>;

export type BandName = keyof typeof BANDS;

/** The denominator of every relative power: the pipeline's 1-45 Hz total. */
export const TOTAL_BAND: Band = [1, 45];

/** Muscle (jaw, frown) shows as broadband power above the EEG bands. */
export const MUSCLE_BAND: Band = [30, 45];

/** In place, iterative radix-2 Cooley-Tukey; `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0 || im.length !== n) {
    throw new Error(`fft: length must be a power of two, got ${n}`);
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = step * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

const hannCache = new Map<number, Float64Array>();

/** Symmetric Hann window, `0.5 - 0.5 cos(2 pi n / (N - 1))`, as numpy's `hanning(N)`. */
export function hann(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++)
      w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return w;
}

/**
 * One-sided power of a window, bins `0..N/2` at `k * sfreq / N` Hz.
 *
 * The mean is removed first: the Muse's DC offset would otherwise leak through the
 * window's side lobes into the delta and theta bins.
 */
export function powerSpectrum(
  samples: ArrayLike<number>,
  sfreq: number
): { power: Float64Array; binHz: number } {
  const n = samples.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  const w = hann(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (samples[i] - mean) * w[i];
  fft(re, im);
  const power = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return { power, binHz: sfreq / n };
}

/** Sum of the bins whose frequency lies in `[low, high)`. */
export function bandPower(
  power: Float64Array,
  binHz: number,
  [low, high]: Band
): number {
  let sum = 0;
  for (let k = 0; k < power.length; k++) {
    const f = k * binHz;
    if (f >= low && f < high) sum += power[k];
  }
  return sum;
}
