/**
 * A ball on an energy landscape: the Brain Plasticity module's picture of a brain that
 * moves between states.
 *
 * The landscape is a line from 0 to 10 with valleys (each a negative gaussian well) and
 * walls at the ends. The ball feels the slope, loses speed to friction, and can be shaken
 * by noise (the brain's restlessness), pushed by wind (neurofeedback's reward towards a
 * target valley), and can dig the ground where it goes (a soft landscape: plasticity).
 * Four versions of the same simulation, one per step of the module.
 *
 * Pure: `stepBall` takes a state and returns the next; randomness comes from the caller.
 */

/** A valley: centre, depth (positive) and width. */
export interface Well {
  c: number;
  depth: number;
  width: number;
}

/** What one version of the landscape does. */
export interface BallWorld {
  wells: Well[];
  /** Speed lost per unit of time, as a share. */
  friction: number;
  /** Strength of the random shaking. */
  noise: number;
  /** A constant push towards `target` (0 = none). */
  wind: number;
  target?: number;
  /** How fast the ground deepens where the ball is (0 = a hard landscape). */
  dig: number;
}

export interface Ball {
  x: number;
  v: number;
  /** The extra depth dug so far, on `GRID` points over [0, 10]. */
  dug: number[];
  /** Time spent in each valley, for the question "where did it end up?". */
  time: number[];
}

export const X_MIN = 0;
export const X_MAX = 10;
export const GRID = 201;
const DX = (X_MAX - X_MIN) / (GRID - 1);
/** How wide a patch the ball digs at once. */
const DIG_WIDTH = 0.35;
/** The deepest the ball can dig: a valley deepens, it does not become a well. */
export const DIG_CAP = 1.5;

/** A ball at rest at `x` on untouched ground. */
export function dropBall(world: BallWorld, x: number): Ball {
  return {
    x,
    v: 0,
    dug: Array(GRID).fill(0),
    time: world.wells.map(() => 0),
  };
}

/** The height of the landscape at `x`, dug ground included. */
export function heightAt(
  world: BallWorld,
  ball: Ball | null,
  x: number
): number {
  let u = 0;
  for (const w of world.wells)
    u -= w.depth * Math.exp(-((x - w.c) ** 2) / (2 * w.width ** 2));
  // walls: steep near the ends
  u +=
    0.08 * Math.exp((X_MIN + 0.6 - x) * 2.5) +
    0.08 * Math.exp((x - X_MAX + 0.6) * 2.5);
  if (ball) u -= interpolate(ball.dug, x);
  return u;
}

function interpolate(grid: number[], x: number): number {
  const f = (Math.min(Math.max(x, X_MIN), X_MAX) - X_MIN) / DX;
  const i = Math.min(Math.floor(f), GRID - 2);
  const t = f - i;
  return grid[i] * (1 - t) + grid[i + 1] * t;
}

/** The slope at `x` (a central difference). */
export function slopeAt(world: BallWorld, ball: Ball, x: number): number {
  const h = 1e-3;
  return (
    (heightAt(world, ball, x + h) - heightAt(world, ball, x - h)) / (2 * h)
  );
}

/** Which valley `x` is closest to (an index into `world.wells`), or -1 without wells. */
export function valleyOf(world: BallWorld, x: number): number {
  let best = -1;
  let d = Infinity;
  world.wells.forEach((w, i) => {
    if (Math.abs(x - w.c) < d) {
      d = Math.abs(x - w.c);
      best = i;
    }
  });
  return best;
}

/** A standard normal number from two uniform ones (Box-Muller). */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * The ball `dt` later: slope, friction, wind and noise change its speed; it bounces off
 * the ends; in a soft world it digs a little hole where it is, so the valleys it visits
 * get deeper the longer it stays.
 */
export function stepBall(
  world: BallWorld,
  ball: Ball,
  dt: number,
  rand: () => number
): Ball {
  let a = -slopeAt(world, ball, ball.x) - world.friction * ball.v;
  if (world.wind && world.target !== undefined)
    a += world.wind * Math.sign(world.target - ball.x);
  let v = ball.v + a * dt;
  if (world.noise) v += world.noise * Math.sqrt(dt) * gaussian(rand);
  let x = ball.x + v * dt;
  if (x < X_MIN) {
    x = X_MIN + (X_MIN - x);
    v = -v * 0.5;
  }
  if (x > X_MAX) {
    x = X_MAX - (x - X_MAX);
    v = -v * 0.5;
  }
  let dug = ball.dug;
  if (world.dig) {
    dug = ball.dug.slice();
    const lo = Math.max(0, Math.floor((x - 3 * DIG_WIDTH - X_MIN) / DX));
    const hi = Math.min(GRID - 1, Math.ceil((x + 3 * DIG_WIDTH - X_MIN) / DX));
    for (let i = lo; i <= hi; i++) {
      const xi = X_MIN + i * DX;
      dug[i] = Math.min(
        DIG_CAP,
        dug[i] +
          world.dig * dt * Math.exp(-((xi - x) ** 2) / (2 * DIG_WIDTH ** 2))
      );
    }
  }
  const time = ball.time.slice();
  const valley = valleyOf(world, x);
  if (valley >= 0) time[valley] += dt;
  return { x, v, dug, time };
}

/** The valley where the ball spent most of its time, or -1 before it has moved. */
export function favouriteValley(ball: Ball): number {
  const max = Math.max(0, ...ball.time);
  return max === 0 ? -1 : ball.time.indexOf(max);
}

/** Three valleys: two shallow ones side by side and a deep one, used by every version. */
export const WELLS: Well[] = [
  { c: 2.2, depth: 1, width: 0.7 },
  { c: 4.6, depth: 0.9, width: 0.7 },
  { c: 7.6, depth: 1.6, width: 0.8 },
];

/** The versions of the module, in order. */
export const WORLDS = {
  /** v1a: little friction, the ball rocks between the two shallow valleys. */
  rocking: { wells: WELLS, friction: 0.02, noise: 0, wind: 0, dig: 0 },
  /** v1b: much friction, the ball settles in the first valley it meets. */
  stuck: { wells: WELLS, friction: 1.2, noise: 0, wind: 0, dig: 0 },
  /** v2: a restless ball, shaken at random. */
  restless: { wells: WELLS, friction: 0.8, noise: 1.1, wind: 0, dig: 0 },
  /** v3: soft ground, valleys deepen where the ball goes. */
  soft: { wells: WELLS, friction: 0.8, noise: 1.1, wind: 0, dig: 0.06 },
  /** Neurofeedback: a gentle wind towards the middle valley. */
  wind: {
    wells: WELLS,
    friction: 0.8,
    noise: 1.1,
    wind: 0.5,
    target: 4.6,
    dig: 0.06,
  },
} satisfies Record<string, BallWorld>;

export type WorldName = keyof typeof WORLDS;
