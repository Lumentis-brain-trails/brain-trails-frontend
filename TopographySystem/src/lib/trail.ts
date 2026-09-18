import { BANDS, BAND_NAMES } from "./bands";
import type { Sample } from "./eegSimulator";
import type { Terrain } from "./terrain";

export interface TrailPoint {
  x: number;
  y: number; // terrain height at (x,z) + small hover offset
  z: number;
  t: number;
  dominant: Sample["dominant"];
  phase: string;
}

/**
 * Walks a path across the terrain driven by the EEG samples: at each step
 * the direction is a power-weighted blend of each band's compass angle,
 * and the step length scales with overall "arousal" (beta+gamma vs
 * delta+theta). This is the hiking trail across the topography.
 */
export function buildTrail(samples: Sample[], terrain: Terrain): TrailPoint[] {
  const bounds = terrain.size * 0.46;
  let x = 0;
  let z = 0;
  let heading = 0;

  const points: TrailPoint[] = [];

  for (const sample of samples) {
    let dx = 0;
    let dz = 0;
    let totalPower = 0;
    for (const band of BANDS) {
      const p = sample.bands[band.name];
      dx += Math.cos(band.angle) * p;
      dz += Math.sin(band.angle) * p;
      totalPower += p;
    }
    const targetHeading = Math.atan2(dz, dx);

    // smooth turning instead of snapping straight to the target heading
    let delta = targetHeading - heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    heading += delta * 0.15;

    const arousal =
      (sample.bands.beta + sample.bands.gamma) /
      Math.max(0.001, sample.bands.delta + sample.bands.theta + 0.6);
    const step = 0.35 + arousal * 0.9 + (totalPower / BAND_NAMES.length) * 0.4;

    let nx = x + Math.cos(heading) * step;
    let nz = z + Math.sin(heading) * step;

    // soft-bounce off the walkable radius so the trail stays on terrain
    const r = Math.sqrt(nx * nx + nz * nz);
    if (r > bounds) {
      heading += Math.PI * 0.6;
      nx = x + Math.cos(heading) * step;
      nz = z + Math.sin(heading) * step;
    }

    x = nx;
    z = nz;

    points.push({
      x,
      z,
      y: terrain.heightAt(x, z) + 0.18,
      t: sample.t,
      dominant: sample.dominant,
      phase: sample.phase,
    });
  }

  return points;
}
