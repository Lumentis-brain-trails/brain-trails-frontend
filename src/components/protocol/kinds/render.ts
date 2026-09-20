/**
 * Canvas painting for the Go/No-Go task. No state, no timing, no clock reads.
 *
 * Beacons are distinguished by *shape* as well as colour - a filled disc for green, a
 * hollow triangle for red - because the spec requires the cue to be readable without
 * colour vision. Keeping that here, rather than in the component, means it is reviewable
 * in one place.
 */

import { STAGE_GROUND } from "@/lib/protocol/stage";
import type { Scene } from "@/lib/protocol/engine";

export interface Theme {
  background: string;
  star: string;
  dock: string;
  cargo: string;
  debris: string;
  beaconGo: string;
  beaconStop: string;
  text: string;
}

export const SPACE_THEME: Theme = {
  background: STAGE_GROUND,
  star: "#7b8496",
  dock: "#94a3b8",
  cargo: "#4f8ff7",
  debris: "#e2683c",
  beaconGo: "#3fbf7f",
  beaconStop: "#e05252",
  text: "#e8ecf4",
};

/** Deterministic star field; positions are a function of the index, never of a clock. */
function paintStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: Theme
): void {
  ctx.fillStyle = theme.star;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 60; i++) {
    const x = ((i * 7919) % 1000) / 1000;
    const y = ((i * 6271) % 1000) / 1000;
    const r = 0.6 + (((i * 31) % 10) / 10) * 0.9;
    ctx.beginPath();
    ctx.arc(x * w, y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintDock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: Theme
): void {
  const x = w * 0.82;
  const y = h / 2;
  ctx.strokeStyle = theme.dock;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintBeacon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: Theme,
  beacon: "green" | "red"
): void {
  const x = w * 0.82;
  const y = h / 2 - 90;
  if (beacon === "green") {
    ctx.fillStyle = theme.beaconGo;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = theme.beaconStop;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.lineTo(x + 21, y + 16);
    ctx.lineTo(x - 21, y + 16);
    ctx.closePath();
    ctx.stroke();
  }
}

function paintObject(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: Theme,
  scene: Scene,
  reducedMotion: boolean
): void {
  if (scene.objectClass === null || scene.objectProgress === null) return;
  const y = h / 2;
  // Reduced motion: the object holds at the dock instead of travelling across the screen.
  const x = reducedMotion
    ? w * 0.82
    : w * 0.08 + (w * 0.74 - 0) * scene.objectProgress;

  if (scene.objectClass === "cargo") {
    ctx.fillStyle = theme.cargo;
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 13, 36, 26, 6);
    ctx.fill();
  } else {
    ctx.fillStyle = theme.debris;
    ctx.beginPath();
    ctx.moveTo(x, y - 17);
    ctx.lineTo(x + 16, y - 4);
    ctx.lineTo(x + 10, y + 16);
    ctx.lineTo(x - 11, y + 15);
    ctx.lineTo(x - 17, y - 5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Calm, deterministic feedback: no punishment, no celebration, no score. */
function paintFeedback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: Theme,
  scene: Scene
): void {
  if (scene.feedback === null) return;
  const x = w * 0.82;
  const y = h / 2;
  if (scene.feedback === "hit") {
    ctx.strokeStyle = theme.cargo;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (scene.feedback === "commission_error") {
    ctx.strokeStyle = theme.dock;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function paint(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  scene: Scene,
  theme: Theme = SPACE_THEME,
  reducedMotion = false
): void {
  const { width: w, height: h } = size;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  paintStars(ctx, w, h, theme);
  paintDock(ctx, w, h, theme);
  if (scene.beacon) paintBeacon(ctx, w, h, theme, scene.beacon);
  paintObject(ctx, w, h, theme, scene, reducedMotion);
  paintFeedback(ctx, w, h, theme, scene);
}
