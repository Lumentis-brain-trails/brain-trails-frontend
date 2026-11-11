"use client";

/**
 * A canvas that fills its box and is redrawn every animation frame, for the
 * neurofeedback animations: sized to the device pixels, paused while the tab is hidden.
 * `draw` gets the 2D context, the box in CSS pixels and the seconds since the last frame
 * (at most 0.1, so a tab coming back does not jump).
 */

import { type RefObject, useEffect, useRef } from "react";

export type Draw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dtS: number,
  timeS: number
) => void;

export function useFeedbackCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: Draw,
  scale = 1
) {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    // jsdom has no 2D context: the block still runs, without the picture
    if (!canvas || !ctx) return;
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = (window.devicePixelRatio || 1) / scale;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    let raf = 0;
    let last = 0;
    let time = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      time += dt;
      drawRef.current(ctx, width, height, dt, time);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) start();
    };
    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canvasRef, scale]);
}
