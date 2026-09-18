import { createNoise2D } from "simplex-noise";
import { BANDS, BAND_NAMES, type BandName } from "./bands";
import type { Sample } from "./eegSimulator";

export interface TerrainOptions {
  size: number; // world units, terrain spans [-size/2, size/2] on x and z
  resolution: number; // vertices per side
  heightScale: number;
  seed?: number;
}

export interface Terrain {
  size: number;
  resolution: number;
  heightAt: (x: number, z: number) => number;
  minHeight: number;
  maxHeight: number;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a heightmap sampler whose character is driven by average band
 * power across a session: bands contribute a noise octave each, using
 * their own spatial frequency (delta = broad rolling hills, gamma = fine
 * jitter) weighted by how strongly that band showed up overall. This is
 * what makes two different sessions produce visibly different landscapes.
 */
export function buildTerrain(
  samples: Sample[],
  options: TerrainOptions
): Terrain {
  const { size, heightScale, seed = 7 } = options;

  const avgPower: Record<BandName, number> = {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
  };
  for (const s of samples) {
    for (const n of BAND_NAMES) avgPower[n] += s.bands[n];
  }
  for (const n of BAND_NAMES) avgPower[n] /= Math.max(1, samples.length);

  const rand = mulberry32(seed);
  const noises = BANDS.map(() => createNoise2D(rand));

  const heightAt = (x: number, z: number) => {
    let h = 0;
    BANDS.forEach((band, i) => {
      const weight = avgPower[band.name] * band.noiseAmplitude;
      h +=
        noises[i](x * band.noiseFrequency, z * band.noiseFrequency) * weight;
    });
    // gentle dome falloff so the landscape reads as an island of terrain
    // rather than tiling noise cut off at hard edges
    const d = Math.sqrt(x * x + z * z) / (size * 0.62);
    const falloff = Math.max(0, 1 - d * d);
    return h * heightScale * falloff;
  };

  // sample to find actual min/max for coloring
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const probe = 40;
  for (let i = 0; i <= probe; i++) {
    for (let j = 0; j <= probe; j++) {
      const x = (i / probe - 0.5) * size;
      const z = (j / probe - 0.5) * size;
      const h = heightAt(x, z);
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  return {
    size,
    resolution: options.resolution,
    heightAt,
    minHeight,
    maxHeight,
  };
}
