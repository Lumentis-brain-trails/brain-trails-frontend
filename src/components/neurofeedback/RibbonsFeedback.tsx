"use client";

/**
 * The ribbons (V4-0010): the landing page's two ribbons of light, blurred and tucked
 * into their corners while the person is away from the target, coming out of the blur
 * and drawing toward each other as they get there, slowing their drift while they stay.
 *
 * Drawn with the landing page's own shapes (`CornerRibbons`). The light follows the
 * luminance the engine allows (H4): the ribbons never brighten faster than the video
 * would; the blur and the position follow the ramped level, eased between updates.
 */

import { type RefObject, useRef } from "react";
import { RIBBONS, drawRibbon } from "@/components/CornerRibbons";
import { type FeedbackFrame, ease } from "./frame";
import { useFeedbackCanvas } from "./useFeedbackCanvas";

/** Margin the canvas is grown by, so the blur's edge fade falls outside the frame. */
const BLEED = 140;
/** The blur in target and fully out of it, in CSS px. */
const SHARP_PX = 6;
const BLURRED_PX = 42;
/** Rendered at half resolution: the softness comes from the blur. */
const SCALE = 2;

export function RibbonsFeedback({
  frameRef,
}: {
  frameRef: RefObject<FeedbackFrame>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ level: 0.25, light: 1, clock: 0, blur: BLURRED_PX });

  useFeedbackCanvas(
    canvasRef,
    (ctx, w, h, dt) => {
      const f = frameRef.current;
      const s = state.current;
      s.level = ease(s.level, f.phase === "baseline" ? 0.25 : f.level, dt, 0.8);
      s.light = ease(s.light, f.brightness, dt, 0.3);
      // calmer while in target: the drift slows to half
      s.clock += dt * (1 - 0.5 * s.level);
      const blur = BLURRED_PX - (BLURRED_PX - SHARP_PX) * s.level;
      if (Math.abs(blur - s.blur) > 0.25 && canvasRef.current) {
        s.blur = blur;
        canvasRef.current.style.filter = `blur(${blur.toFixed(1)}px)`;
      }
      // out of target the ribbons retreat into their corners; in target they come
      // past their landing-page place, toward each other
      const retreat = 0.32 * (1 - s.level) - 0.2 * s.level;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.light));
      ctx.translate(BLEED, BLEED);
      for (const ribbon of RIBBONS)
        drawRibbon(ctx, ribbon, s.clock, w - 2 * BLEED, h - 2 * BLEED, retreat);
      ctx.restore();
    },
    SCALE
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{
          top: -BLEED,
          left: -BLEED,
          width: `calc(100% + ${2 * BLEED}px)`,
          height: `calc(100% + ${2 * BLEED}px)`,
          filter: `blur(${BLURRED_PX}px)`,
        }}
      />
    </div>
  );
}
