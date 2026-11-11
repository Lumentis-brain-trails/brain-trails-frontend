"use client";

/**
 * Tuning (V4-0010): two notes a fifth apart, the upper one out of tune while the person
 * is away from the target - the beating of a string not yet tuned - coming into tune as
 * they get there, and the sound opening up (a low-pass filter lifts, an octave joins)
 * while they stay. On screen, a tuner's needle and two rings that become one.
 *
 * Sound is the feedback here, so the eyes may close. The beating is heard, never shown:
 * a picture pulsing at the beat (a few hertz) would be a flash in the band H4 forbids;
 * the rings and the needle move only as the level does, and their light follows the
 * luminance the engine allows. Browsers start sound only after a gesture: if the run's
 * own clicks did not unlock it, a button asks for one.
 */

import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";
import { type FeedbackFrame, ease } from "./frame";
import { useFeedbackCanvas } from "./useFeedbackCanvas";

/** The lower note, A3, and the fifth above it. */
export const ROOT_HZ = 220;
export const FIFTH = 1.5;
/** How far out of tune the fifth is, fully out of target. */
export const MAX_CENTS = 35;
const VOLUME = 0.08;

/** The fifth's detuning for a level: `MAX_CENTS` at 0, in tune at 1. */
export function centsFor(level: number): number {
  return MAX_CENTS * (1 - Math.max(0, Math.min(1, level)));
}

interface Voice {
  ctx: AudioContext;
  fifth: OscillatorNode;
  octave: GainNode;
  filter: BiquadFilterNode;
  master: GainNode;
}

function startVoice(): Voice | null {
  const Ctor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 1);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.connect(master);
  master.connect(ctx.destination);
  const note = (hz: number, type: OscillatorType, gain: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(filter);
    osc.start();
    return { osc, g };
  };
  note(ROOT_HZ, "triangle", 0.6);
  const fifth = note(ROOT_HZ * FIFTH, "triangle", 0.45).osc;
  fifth.detune.value = MAX_CENTS;
  const octave = note(ROOT_HZ * 2, "sine", 0).g;
  return { ctx, fifth, octave, filter, master };
}

export function TuningFeedback({
  frameRef,
}: {
  frameRef: RefObject<FeedbackFrame>;
}) {
  const t = useTranslations("kinds.neurofeedback");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voice = useRef<Voice | null>(null);
  const [suspended, setSuspended] = useState(false);
  const state = useRef({ level: 0, light: 1 });

  useEffect(() => {
    const v = startVoice();
    voice.current = v;
    // a context the page's gestures did not unlock stays suspended, its resume
    // pending: ask for a click if it is still silent a moment later
    if (v && v.ctx.state === "suspended") void v.ctx.resume();
    const check = setTimeout(
      () => setSuspended(v?.ctx.state === "suspended"),
      600
    );
    return () => {
      clearTimeout(check);
      if (!v) return;
      v.master.gain.setTargetAtTime(0, v.ctx.currentTime, 0.2);
      setTimeout(() => void v.ctx.close(), 800);
      voice.current = null;
    };
  }, []);

  useFeedbackCanvas(canvasRef, (ctx, w, h, dt) => {
    const f = frameRef.current;
    const s = state.current;
    s.level = ease(s.level, f.phase === "baseline" ? 0 : f.level, dt, 0.8);
    s.light = ease(s.light, f.brightness, dt, 0.3);
    const cents = centsFor(s.level);
    const v = voice.current;
    if (v) {
      const now = v.ctx.currentTime;
      v.fifth.detune.setTargetAtTime(cents, now, 0.25);
      v.filter.frequency.setTargetAtTime(600 + 3400 * s.level, now, 0.4);
      v.octave.gain.setTargetAtTime(0.3 * s.level ** 2, now, 0.4);
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, Math.min(1, s.light));
    const cx = w / 2;
    const cy = h * 0.52;
    const R = Math.min(w, h) * 0.3;
    // the tuner's scale: ticks over 120 degrees, the centre one longer
    for (let k = -10; k <= 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * (Math.PI / 3);
      const long = k === 0;
      ctx.strokeStyle = long
        ? `rgba(255,255,255,${0.35 + 0.5 * s.level})`
        : "rgba(255,255,255,0.18)";
      ctx.lineWidth = long ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12);
      ctx.lineTo(
        cx + Math.cos(a) * R * (long ? 1.28 : 1.2),
        cy + Math.sin(a) * R * (long ? 1.28 : 1.2)
      );
      ctx.stroke();
    }
    // the needle: the fifth's detuning on a scale of +-MAX_CENTS
    const needle = -Math.PI / 2 + (cents / MAX_CENTS) * (Math.PI / 3);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needle) * R * 1.1,
      cy + Math.sin(needle) * R * 1.1
    );
    ctx.stroke();
    // the two notes, as rings: apart while out of tune, one ring in tune
    const apart = (cents / MAX_CENTS) * R * 0.45;
    const ring = (dx: number, rgb: string) => {
      ctx.strokeStyle = `rgba(${rgb},0.85)`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx + dx, cy, R * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(-apart, "249,186,74");
    ring(apart, "255,156,206");
    ctx.globalAlpha = 1;
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 h-full w-full"
      />
      {suspended && (
        <button
          type="button"
          onClick={() =>
            void voice.current?.ctx
              .resume()
              .then(() =>
                setSuspended(voice.current?.ctx.state === "suspended")
              )
          }
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-[14px] text-white/80"
        >
          {t("soundOn")}
        </button>
      )}
    </>
  );
}
