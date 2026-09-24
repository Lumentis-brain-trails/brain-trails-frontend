"use client";

/**
 * The soundtrack: sounds that play over the steps instead of taking a turn (V3-0014).
 *
 * Steps run one at a time; a cue does not wait for its turn. It starts as the step it is
 * anchored to begins (plus a delay), or with the run, and stops as its stop step
 * completes, with the run, or when the file runs out. Every start and stop is a marker
 * on the run's timeline, so the review page can say what was playing under any moment.
 *
 * Plain `HTMLAudioElement`s, with volume ramped by animation frames for the fades. That is
 * right for music and spoken instructions and wrong for an auditory ERP: a cue lands
 * within a frame or two of its step, and a sound that must be time-locked to the EEG
 * belongs in a block, where the onset machinery is.
 */
import { useCallback, useEffect, useRef } from "react";
import type { MarkerDraft } from "@/lib/protocol/marker";
import type { PlannedCue } from "@/lib/protocol/types";

interface Playing {
  audio?: HTMLAudioElement;
  timer?: ReturnType<typeof setTimeout>;
  raf?: number;
  stopping?: boolean;
}

/** Ramp `audio.volume` to `to` over `seconds`, then call `done`. */
function ramp(
  audio: HTMLAudioElement,
  to: number,
  seconds: number,
  entry: Playing,
  done?: () => void
) {
  if (entry.raf !== undefined) cancelAnimationFrame(entry.raf);
  const from = audio.volume;
  if (seconds <= 0) {
    audio.volume = to;
    done?.();
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / (seconds * 1000));
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) entry.raf = requestAnimationFrame(step);
    else {
      entry.raf = undefined;
      done?.();
    }
  };
  entry.raf = requestAnimationFrame(step);
}

export function useSoundtrack({
  cues,
  stepIndex,
  running,
  emit,
}: {
  cues: readonly PlannedCue[];
  stepIndex: number;
  running: boolean;
  emit: (draft: MarkerDraft) => void;
}): { stopAll: () => void } {
  const playing = useRef(new Map<string, Playing>());
  const started = useRef(false);
  const previous = useRef<number | null>(null);
  // The latest `emit`, kept in a ref so a fade that ends seconds later still stamps its
  // marker through the runner's current clock rather than a stale closure.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  const meta = (cue: PlannedCue) => ({
    cue_id: cue.id,
    media_id: cue.media_id,
    ...(cue.label ? { cue_label: cue.label } : {}),
  });

  const stop = useCallback((cue: PlannedCue, fade = true) => {
    const entry = playing.current.get(cue.id);
    if (!entry || entry.stopping) return;
    entry.stopping = true;
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    const audio = entry.audio;
    if (!audio) {
      playing.current.delete(cue.id); // never started: nothing to say
      return;
    }
    const end = () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      playing.current.delete(cue.id);
    };
    emitRef.current({ label: "sound_stop", kind: "stimulus", meta: meta(cue) });
    ramp(audio, 0, fade ? cue.fadeS : 0, entry, end);
  }, []);

  const start = useCallback(
    (cue: PlannedCue) => {
      if (!cue.src || playing.current.has(cue.id)) return;
      const entry: Playing = {};
      playing.current.set(cue.id, entry);
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (entry.stopping) return;
        const audio = new Audio(cue.src);
        audio.loop = cue.loop;
        audio.volume = 0;
        entry.audio = audio;
        if (cue.stop.kind === "clip_end" && !cue.loop)
          audio.addEventListener("ended", () => stop(cue, false), {
            once: true,
          });
        audio
          .play()
          .then(() => {
            emitRef.current({
              label: "sound_start",
              kind: "stimulus",
              meta: { ...meta(cue), timing_source: "ui" },
            });
            ramp(audio, cue.volume, cue.fadeS, entry);
          })
          .catch((error: unknown) => {
            // A file that will not play must not take the run down with it.
            playing.current.delete(cue.id);
            emitRef.current({
              label: "sound_error",
              kind: "system",
              meta: { ...meta(cue), error: String(error) },
            });
          });
      }, cue.offsetS * 1000);
    },
    [stop]
  );

  const stopAll = useCallback(() => {
    for (const cue of cues) stop(cue);
  }, [cues, stop]);

  useEffect(() => {
    if (!running) return;
    if (!started.current) {
      started.current = true;
      previous.current = stepIndex;
      for (const cue of cues)
        if (cue.startStep === null || cue.startStep === stepIndex) start(cue);
      return;
    }
    const left = previous.current;
    if (left === stepIndex) return;
    previous.current = stepIndex;
    for (const cue of cues)
      if (cue.stop.kind === "step" && cue.stop.step === left) stop(cue);
    for (const cue of cues) if (cue.startStep === stepIndex) start(cue);
  }, [cues, running, start, stepIndex, stop]);

  // Whatever happens to the run - finished, abandoned, navigated away - nothing keeps
  // playing after it: a sound with no page to stop it is the worst way to end a session.
  useEffect(() => {
    const map = playing.current;
    return () => {
      for (const entry of map.values()) {
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        if (entry.raf !== undefined) cancelAnimationFrame(entry.raf);
        entry.audio?.pause();
      }
      map.clear();
    };
  }, []);

  return { stopAll };
}
