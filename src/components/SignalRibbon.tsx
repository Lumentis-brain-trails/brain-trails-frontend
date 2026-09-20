"use client";

import { useEffect, useRef } from "react";
import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality } from "@/lib/muse/quality";
import {
  DEFAULT_SIGMA,
  RIBBON_POSITIONS,
  buildStrands,
  centreOffset,
  noiseAt,
  noiseFromQuality,
  spreadFraction,
  strandOffset,
} from "@/lib/signalRibbon";
import { CHART_THEMES, useTheme } from "@/lib/theme";

/** Enough strands for the caustics to form, few enough to stay a drawing. */
const STRAND_COUNT = 14;
/** Seconds to cross most of the way to a new contact level. */
const EASE = 0.02;

/**
 * Contact quality as one flowing band (see `lib/signalRibbon` for the model).
 *
 * The bright seams are not drawn: a strand following a sine spends most of its
 * time near its turning points, so the strands crowd at the edges of the swing
 * and those crowded places carry the light on their own.
 *
 * Nothing here re-renders React. The canvas is driven by its own loop, reading
 * the latest quality through a ref, and the loop stops whenever the tab is
 * hidden or the headband is not streaming, because this sits on the screen for
 * the whole of a run.
 */
export function SignalRibbon({
  quality,
  active = true,
  height = 150,
  className,
}: {
  quality: Record<EegChannel, ChannelQuality>;
  /** False pauses the animation (disconnected headband, or a finished run). */
  active?: boolean;
  /** Height in CSS pixels; the width follows the container. */
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<number[]>(noiseFromQuality(quality));
  // Only a trigger: the appearance that applies *here* is resolved from the DOM
  // below, because a subtree can pin its own (the runner pins dark).
  const rootAppearance = useTheme();

  useEffect(() => {
    targetRef.current = noiseFromQuality(quality);
  }, [quality]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const layer = document.createElement("canvas");
    const lc = layer.getContext("2d");
    if (!lc) return;

    // Appearance is whatever the nearest themed ancestor says, the way the CSS
    // resolves it: <html> carries one, and a subtree may pin another over it.
    const pinned = canvas.closest<HTMLElement>("[data-theme]")?.dataset.theme;
    const appearance =
      pinned === "dark" || pinned === "light" ? pinned : rootAppearance;
    const theme = CHART_THEMES[appearance];
    const additive = appearance === "dark";
    const strands = buildStrands(STRAND_COUNT);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Start settled rather than easing up from nothing on mount.
    let current = [...targetRef.current];
    let width = 0;
    let dpr = 1;
    let t = 0;
    let frame = 0;
    let previous = 0;

    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const stops = theme.ribbon.map(rgb);
    const tints = additive
      ? [rgb("#96d6ff"), null, rgb("#ffceba")]
      : [rgb("#3f7fd0"), null, rgb("#b8633a")];

    /** The ramp at disturbance `n`, optionally pulled towards a tint. */
    const colourAt = (n: number, tint: number[] | null) => {
      const scaled = Math.min(1, Math.max(0, n)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(scaled));
      const f = scaled - i;
      const out = [0, 1, 2].map(
        (c) => stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f
      );
      if (!tint) return out;
      return out.map((v, c) => v + (tint[c] - v) * 0.22);
    };

    /** Smooth fade so the bundle enters and leaves the frame. */
    const fadeAt = (u: number) => {
      const e = Math.min(1, Math.max(0, Math.min(u, 1 - u) / 0.07));
      return e * e * (3 - 2 * e);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || 320;
      for (const c of [canvas, layer]) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const steps = Math.round(Math.min(160, Math.max(64, width / 6)));
      const centre = height / 2;

      // Transparent ground: the band belongs to the card it sits in, and an
      // opaque fill of its own would read as a rectangle pasted over it. The
      // strands blend against each other on the offscreen layer, so the ground
      // underneath is free to be whatever the surface is.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Three gradients along x, carrying the field colour and the end fade, so
      // each strand costs one stroke instead of one per segment.
      const gradients = tints.map((tint) => {
        const g = lc.createLinearGradient(0, 0, width, 0);
        for (let i = 0; i <= 24; i++) {
          const u = i / 24;
          const n = noiseAt(u, current, DEFAULT_SIGMA);
          const [r, gr, b] = colourAt(n, tint);
          // Thin the strands out where the bundle frays. Stacking this many
          // pale lines additively would otherwise blow the hot end to white,
          // and a white patch says "bright", not "this sensor is wrong".
          const a = fadeAt(u) * (1 - 0.4 * n);
          g.addColorStop(
            u,
            `rgba(${r | 0}, ${gr | 0}, ${b | 0}, ${a.toFixed(3)})`
          );
        }
        return g;
      });

      lc.clearRect(0, 0, width, height);
      lc.globalCompositeOperation = additive ? "lighter" : "multiply";
      lc.lineJoin = "round";
      lc.lineCap = "round";

      for (const s of strands) {
        lc.beginPath();
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const n = noiseAt(u, current, DEFAULT_SIGMA);
          const y =
            centre +
            height * centreOffset(u, t) +
            height * spreadFraction(n) * strandOffset(s, u, n, t);
          if (i === 0) lc.moveTo(u * width, y);
          else lc.lineTo(u * width, y);
        }
        // Halo pass, then the filament: the strand carries its own glow, so the
        // blur below only has to soften it rather than invent it.
        lc.strokeStyle = gradients[s.tint];
        lc.globalAlpha = s.alpha * (additive ? 0.2 : 0.12);
        lc.lineWidth = s.width * 3.6;
        lc.stroke();
        lc.globalAlpha = s.alpha;
        lc.lineWidth = s.width;
        lc.stroke();
      }
      lc.globalAlpha = 1;

      if (additive) {
        // Two-radius bloom: a tight flare on the filaments, a wide haze around
        // the bundle. Emissive only; on a light ground the stack darkens instead.
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = "blur(5px)";
        ctx.globalAlpha = 0.5;
        ctx.drawImage(layer, 0, 0, width, height);
        ctx.filter = "blur(24px)";
        ctx.globalAlpha = 0.55;
        ctx.drawImage(layer, 0, 0, width, height);
        ctx.filter = "none";
      }
      ctx.globalAlpha = additive ? 0.95 : 1;
      ctx.drawImage(layer, 0, 0, width, height);

      // A plumb line tying each lamp to its own stretch of the band.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      EEG_CHANNELS.forEach((channel, i) => {
        const [r, g, b] = colourAt(current[i], null);
        const line = ctx.createLinearGradient(0, height * 0.3, 0, height);
        line.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`);
        line.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.16)`);
        ctx.fillStyle = line;
        ctx.fillRect(
          RIBBON_POSITIONS[channel] * width - 0.5,
          height * 0.3,
          1,
          height * 0.7
        );
      });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const k = 1 - Math.pow(EASE, dt);
      for (let i = 0; i < current.length; i++) {
        current[i] += (targetRef.current[i] - current[i]) * k;
      }
      t += dt;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const run = () => {
      if (frame || reduced || !active || document.hidden) return;
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(canvas);
    resize();
    // Reduced motion still gets the reading, as a still frame.
    current = [...targetRef.current];
    draw();
    run();

    const onVisibility = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      stop();
    };
  }, [rootAppearance, height, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: "block", width: "100%", height }}
    />
  );
}
