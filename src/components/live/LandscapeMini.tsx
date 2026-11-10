"use client";

/**
 * The person's landscape from above, small, with where the session is now (T4b).
 *
 * For the corner of a run on yourself, over the black stage: a 3D surface there would
 * cost a WebGL context and draw the eye. This is one canvas: the heights as a heat map in
 * the dark landscape ramp, the last `TAIL` windows as a fading line, and the newest one as
 * a bright dot. It redraws when the map grows (every 30 s) and when a window arrives.
 */

import { useEffect, useRef } from "react";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { CHART_THEMES } from "@/lib/theme";

/** Windows of the recent path drawn behind the dot: half a minute at a 1 s step. */
export const TAIL = 30;

function hex(colour: string): [number, number, number] {
  const n = parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ramp's colour at height `z` (0-1), linear between its stops. */
export function rampAt(
  stops: readonly (readonly [number, string])[],
  z: number
): [number, number, number] {
  const v = Math.min(1, Math.max(0, z));
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i];
    if (v <= b) {
      const [a, ca] = stops[i - 1];
      const t = b > a ? (v - a) / (b - a) : 0;
      const [r0, g0, b0] = hex(ca);
      const [r1, g1, b1] = hex(cb);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  return hex(stops[stops.length - 1][1]);
}

export function LandscapeMini({
  landscape,
  x,
  y,
  width = 224,
  height = 160,
  label,
}: {
  landscape: BrainLandscape;
  /** The session's windows on the map, smoothed, oldest first. */
  x: readonly number[];
  y: readonly number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const ground = useRef<HTMLCanvasElement | null>(null);
  const path = useRef<HTMLCanvasElement | null>(null);
  const stops = CHART_THEMES.dark.landscape;

  // the heat map, once per map
  useEffect(() => {
    const ctx = ground.current?.getContext("2d");
    if (!ctx) return;
    const { nx, ny, z } = landscape.grid;
    const image = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const [r, g, b] = rampAt(stops, z[j]?.[i] ?? 0);
        const at = ((ny - 1 - j) * nx + i) * 4; // row 0 is the bottom of the map
        image.data[at] = r;
        image.data[at + 1] = g;
        image.data[at + 2] = b;
        image.data[at + 3] = 255;
      }
    }
    const tile = document.createElement("canvas");
    tile.width = nx;
    tile.height = ny;
    tile.getContext("2d")?.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tile, 0, 0, width, height);
  }, [landscape, stops, width, height]);

  // the recent path and the dot, on every window
  useEffect(() => {
    const ctx = path.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const [x0, x1, y0, y1] = landscape.bounds;
    const px = (v: number) => ((v - x0) / (x1 - x0 || 1)) * width;
    const py = (v: number) => height - ((v - y0) / (y1 - y0 || 1)) * height;
    const from = Math.max(0, x.length - TAIL);
    ctx.lineCap = "round";
    ctx.lineWidth = 2;
    for (let i = from + 1; i < x.length; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${(0.15 + (0.75 * (i - from)) / TAIL).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(px(x[i - 1]), py(y[i - 1]));
      ctx.lineTo(px(x[i]), py(y[i]));
      ctx.stroke();
    }
    const last = x.length - 1;
    if (last < 0) return;
    const cx = Math.min(width - 4, Math.max(4, px(x[last])));
    const cy = Math.min(height - 4, Math.max(4, py(y[last])));
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [landscape.bounds, x, y, width, height]);

  return (
    <div
      role="img"
      aria-label={label}
      className="relative overflow-hidden rounded-[calc(var(--radius-card)-4px)]"
      style={{ width, height }}
    >
      <canvas
        ref={ground}
        width={width}
        height={height}
        className="absolute inset-0"
      />
      <canvas
        ref={path}
        width={width}
        height={height}
        className="absolute inset-0"
      />
    </div>
  );
}
