"use client";

/**
 * Lantern, drawn (V4-0013; the rules are `lib/neurofeedback/lantern.ts`).
 *
 * On the black stage: a dim path winding up from the walker, the lantern's warm light
 * around them, forks coming down the path with a faint marker on the side to take. The
 * light is the trained signal - its strength is the engine's rate-limited brightness and
 * its reach follows that brightness alone - and is drawn with the same falloff
 * `lightAlpha` describes, which is what the photosensitivity test measures. The path,
 * the walker and the markers keep one dim strength whatever the light, so a marker is
 * seen as well in the dark as in the light: the light makes the walk, the hands the way.
 *
 * Input: the left and right arrow keys, or a tap on either half of the stage. Each press
 * is stamped with the input event's own time.
 */

import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
  LANTERN_RGB,
  LIGHT_CORE,
  LIGHT_STRENGTH,
  type Lantern,
  lanternAt,
  lightRadius,
} from "@/lib/neurofeedback/lantern";
import { type FeedbackFrame, ease } from "../frame";
import { useFeedbackCanvas } from "../useFeedbackCanvas";
import type { MotionState } from "./useGameRound";
import type { LanternEvent, Side } from "@/lib/neurofeedback/lantern";

const RGB = LANTERN_RGB.join(",");
/** The path, walker and markers: one dim strength, whatever the light. */
const DIM = "rgba(255,255,255,0.10)";
const MARK = "rgba(255,255,255,0.42)";
/** Where the walker stands and where the path ends, in units of the shorter side. */
const WALKER_Y = 0.4;
const PATH_TOP = -0.56;
/** Where a fork appears and where it meets the walker. */
const FORK_FROM = -0.5;
const FORK_TO = 0.3;
/** With reduced motion a fork stands still here. */
const FORK_STILL = -0.12;
/** How long the hint stays at the start, in seconds. */
const HINT_S = 8;

export function LanternGame({
  frameRef,
  motionRef,
  lantern,
  minLevel,
  reducedMotion,
  paused,
  onEvents,
  onPress,
}: {
  frameRef: RefObject<FeedbackFrame>;
  motionRef: RefObject<MotionState>;
  lantern: Lantern;
  minLevel: number;
  reducedMotion: boolean;
  /** The round is over (the card stands): nothing moves, nothing is asked. */
  paused: boolean;
  onEvents: (events: LanternEvent[], frameMs: number) => void;
  onPress: (side: Side, atMs: number) => void;
}) {
  const t = useTranslations("kinds.neurofeedback.lantern");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // the light as drawn, eased toward the engine's; set on the first frame
  const eased = useRef<{ brightness: number } | null>(null);
  const [hint, setHint] = useState(true);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  });

  useEffect(() => {
    const timer = setTimeout(() => setHint(false), HINT_S * 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || pausedRef.current) return;
      const side: Side | null =
        e.key === "ArrowLeft"
          ? "left"
          : e.key === "ArrowRight"
            ? "right"
            : null;
      if (!side) return;
      e.preventDefault();
      onPress(side, e.timeStamp);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPress]);

  useFeedbackCanvas(canvasRef, (ctx, w, h, dt) => {
    const f = frameRef.current;
    const s = (eased.current ??= { brightness: f.brightness });
    // easing only slows the light: it never changes faster than the engine allows
    s.brightness = ease(s.brightness, f.brightness, dt, 0.15);
    if (!pausedRef.current) {
      const events = lantern.step(dt, {
        brightness: s.brightness,
        minLevel,
        phase: f.phase,
        moving: motionRef.current?.moving ?? false,
      });
      if (events.length) onEvents(events, performance.now());
    }
    draw(ctx, w, h, lantern, s.brightness, reducedMotion);
  });

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        aria-label={t("aria")}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          if (pausedRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onPress(
            e.clientX - rect.left < rect.width / 2 ? "left" : "right",
            e.timeStamp
          );
        }}
      />
      {hint && !paused && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[6%] px-6 text-center text-[15px] text-ink-3">
          {t("hint")}
        </p>
      )}
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lantern: Lantern,
  brightness: number,
  reducedMotion: boolean
) {
  const S = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const X = (u: number) => cx + u * S;
  const Y = (u: number) => cy + u * S;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  // the path: a gentle winding that scrolls as the walker goes on
  const wind = (v: number) =>
    0.06 * Math.sin((v * 0.9 + lantern.walked) * 2 * Math.PI);
  ctx.strokeStyle = DIM;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.08 * S;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const v = i / 40;
    const y = WALKER_Y + (PATH_TOP - WALKER_Y) * v;
    const x = wind(v) * v; // anchored at the walker's feet
    if (i === 0) ctx.moveTo(X(x), Y(y));
    else ctx.lineTo(X(x), Y(y));
  }
  ctx.stroke();

  // the forks: two branches and the marker on the side to take
  for (const fork of lantern.forks) {
    const p = Math.min(1, (lantern.now - fork.shownAt) / fork.window);
    const y = reducedMotion
      ? FORK_STILL
      : FORK_FROM + (FORK_TO - FORK_FROM) * p;
    const v = (WALKER_Y - y) / (WALKER_Y - PATH_TOP);
    const x = wind(v) * v;
    const fade =
      fork.resolvedAt === null
        ? Math.min(1, (lantern.now - fork.shownAt) / 0.4)
        : Math.max(0, 1 - (lantern.now - fork.resolvedAt) / 0.8);
    ctx.globalAlpha = fade;
    ctx.lineWidth = 0.05 * S;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y));
      ctx.lineTo(X(x + dir * 0.16), Y(y - 0.1));
      ctx.stroke();
    }
    const mx = x + (fork.side === "left" ? -0.16 : 0.16);
    ctx.beginPath();
    ctx.arc(X(mx), Y(y - 0.1), 0.026 * S, 0, 2 * Math.PI);
    if (fork.outcome === "correct") {
      ctx.fillStyle = MARK;
      ctx.fill();
    } else {
      ctx.strokeStyle = MARK;
      ctx.lineWidth = 0.006 * S;
      ctx.stroke();
      ctx.strokeStyle = DIM;
    }
    ctx.globalAlpha = 1;
  }

  // the walker: a dim figure, still while the light is low, stepping as it rises
  const step = reducedMotion ? 0 : Math.sin(lantern.walked * 2 * Math.PI * 6);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 0.008 * S;
  ctx.beginPath();
  ctx.arc(X(0), Y(WALKER_Y - 0.07), 0.016 * S, 0, 2 * Math.PI);
  ctx.moveTo(X(0), Y(WALKER_Y - 0.054));
  ctx.lineTo(X(0), Y(WALKER_Y - 0.01));
  ctx.lineTo(X(-0.015 - 0.008 * step), Y(WALKER_Y + 0.03));
  ctx.moveTo(X(0), Y(WALKER_Y - 0.01));
  ctx.lineTo(X(0.015 + 0.008 * step), Y(WALKER_Y + 0.03));
  ctx.stroke();

  // the light, added on top with the falloff `lightAlpha` describes
  const at = lanternAt(lantern.sway);
  const r = lightRadius(lantern.light) * S;
  const gradient = ctx.createRadialGradient(
    X(at.x),
    Y(at.y),
    0,
    X(at.x),
    Y(at.y),
    r
  );
  const b = Math.max(0, Math.min(1, brightness));
  for (let i = 0; i <= 12; i++) {
    const d = i / 12;
    const t = d <= LIGHT_CORE ? 0 : (d - LIGHT_CORE) / (1 - LIGHT_CORE);
    const falloff = 1 - t * t * (3 - 2 * t);
    gradient.addColorStop(
      d,
      `rgba(${RGB},${(LIGHT_STRENGTH * b * falloff).toFixed(4)})`
    );
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  // the lantern itself, at the light's full strength
  ctx.fillStyle = `rgba(${RGB},${b.toFixed(4)})`;
  ctx.beginPath();
  ctx.arc(X(at.x), Y(at.y), 0.012 * S, 0, 2 * Math.PI);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}
