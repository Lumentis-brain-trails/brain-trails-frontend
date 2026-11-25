"use client";

/**
 * The plane (V4-0010): on the runway while the person is away from the target, taking
 * off as they get there and climbing while they stay, sinking back as they drift.
 *
 * The altitude follows the engine's ramped level, eased between updates; the plane's
 * light follows the luminance the engine allows (H4), so it dims out of target and
 * never brightens faster than the video would. On the black stage, with a horizon and a
 * contrail: nothing else moves. During the baseline it waits on the runway.
 */

import { type RefObject, useRef } from "react";
import { type FeedbackFrame, ease } from "./frame";
import { useFeedbackCanvas } from "./useFeedbackCanvas";

const WARM = "249,186,74";
const COOL = "96,216,232";
/** Seconds for the altitude to cover most of a change. */
const TAU_S = 0.8;
const TRAIL = 120;

export function PlaneFeedback({
  frameRef,
}: {
  frameRef: RefObject<FeedbackFrame>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    alt: 0,
    light: 1,
    pitch: 0,
    dash: 0,
    trail: [] as number[],
  });

  useFeedbackCanvas(canvasRef, (ctx, w, h, dt) => {
    const f = frameRef.current;
    const s = state.current;
    const goal = f.phase === "baseline" ? 0 : f.level;
    const before = s.alt;
    s.alt = ease(s.alt, goal, dt, TAU_S);
    s.light = ease(s.light, f.brightness, dt, 0.3);
    const climb = dt > 0 ? (s.alt - before) / dt : 0;
    s.pitch = ease(
      s.pitch,
      Math.max(-0.25, Math.min(0.35, climb * 1.6)),
      dt,
      0.3
    );

    const horizon = h * 0.78;
    const size = Math.min(150, w * 0.12);
    const x = w * 0.42;
    const y = horizon - size * 0.16 - s.alt * h * 0.55;
    // ground speed: rolling on the runway, faster once airborne
    s.dash = (s.dash + dt * (60 + 160 * s.alt)) % 48;
    s.trail.unshift(y);
    if (s.trail.length > TRAIL) s.trail.pop();

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, Math.min(1, s.light));
    // the runway's centre line, under the plane
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * (1 - s.alt)})`;
    ctx.lineWidth = 2;
    for (let dx = -s.dash; dx < w; dx += 48) {
      ctx.beginPath();
      ctx.moveTo(dx, horizon + 10);
      ctx.lineTo(dx + 22, horizon + 10);
      ctx.stroke();
    }

    // contrail: where the plane was, carried back by its speed
    if (s.alt > 0.04) {
      const step = (2 + 4 * s.alt) * 1.2;
      ctx.lineWidth = 2;
      for (let i = 1; i < s.trail.length; i++) {
        const a = (1 - i / s.trail.length) * 0.35 * Math.min(1, s.alt * 4);
        ctx.strokeStyle = `rgba(${COOL},${a})`;
        ctx.beginPath();
        ctx.moveTo(
          x - size * 0.5 - (i - 1) * step,
          s.trail[i - 1] + size * 0.02
        );
        ctx.lineTo(x - size * 0.5 - i * step, s.trail[i] + size * 0.02);
        ctx.stroke();
      }
    }
    drawPlane(ctx, x, y, size, s.pitch);
    ctx.globalAlpha = 1;
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  );
}

/** A side view, nose to the right, `size` px long, pitched by `pitch` radians. */
function drawPlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pitch: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-pitch);
  const L = size;
  const H = size * 0.13;
  // tail fin
  ctx.fillStyle = `rgba(${COOL},0.9)`;
  ctx.beginPath();
  ctx.moveTo(-L * 0.42, -H * 0.4);
  ctx.lineTo(-L * 0.5, -H * 2.2);
  ctx.lineTo(-L * 0.36, -H * 2.2);
  ctx.lineTo(-L * 0.24, -H * 0.4);
  ctx.fill();
  // fuselage
  ctx.fillStyle = `rgb(${WARM})`;
  ctx.beginPath();
  ctx.moveTo(-L * 0.5, -H * 0.45);
  ctx.lineTo(L * 0.34, -H * 0.5);
  ctx.quadraticCurveTo(L * 0.52, -H * 0.4, L * 0.5, H * 0.1);
  ctx.quadraticCurveTo(L * 0.44, H * 0.5, L * 0.3, H * 0.5);
  ctx.lineTo(-L * 0.44, H * 0.4);
  ctx.closePath();
  ctx.fill();
  // wing, seen from the side and a little from above
  ctx.fillStyle = `rgba(${COOL},0.85)`;
  ctx.beginPath();
  ctx.moveTo(-L * 0.04, H * 0.1);
  ctx.lineTo(L * 0.14, H * 0.1);
  ctx.lineTo(-L * 0.14, H * 1.5);
  ctx.lineTo(-L * 0.24, H * 1.5);
  ctx.closePath();
  ctx.fill();
  // windows
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-L * 0.18 + i * L * 0.075, -H * 0.12, H * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
