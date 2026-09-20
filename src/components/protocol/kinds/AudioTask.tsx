"use client";

/**
 * An audio clip, played through Web Audio rather than an `<audio>` element.
 *
 * An `<audio>` element starts "soon" after `play()`; a buffer source starts at a
 * context time chosen in advance, sample-accurately, and `audioTimeToHost` maps that
 * time onto the host clock. So the `stimulus_onset` marker is stamped with when the
 * sound actually leaves the output (`timing_source: "webaudio"`), not when a promise
 * resolved. The clip is fully decoded before it is scheduled, for the same reason the
 * image kind decodes before its first onset.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { type AudioConfig, audioConfigSchema } from "@/lib/protocol/blocks";
import { audioContextCtor, audioTimeToHost } from "@/lib/protocol/audioClock";
import { timingMeta } from "@/lib/protocol/marker";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useLatest } from "./shared";

/** Lead time between scheduling and onset, so the start is never in the past. */
const SCHEDULE_AHEAD_S = 0.1;

type State = "loading" | "playing" | "error";

function AudioRenderer(ctx: TaskContext<AudioConfig>) {
  const t = useTranslations("kinds");
  const { src, media_id, volume, start_s, end_s } = ctx.config;
  const finish = useFinish(ctx, "audio");
  const emit = useLatest(ctx.emit);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const Ctor = audioContextCtor();
    if (!src || !Ctor) {
      queueMicrotask(() => setState("error"));
      return;
    }
    const audio = new Ctor();
    let source: AudioBufferSourceNode | null = null;
    let cancelled = false;
    const media = media_id ? { media_id } : {};

    (async () => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`audio ${response.status}`);
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      if (cancelled) return;
      await audio.resume();

      const gain = audio.createGain();
      gain.gain.value = volume;
      source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(gain).connect(audio.destination);
      const at = audio.currentTime + SCHEDULE_AHEAD_S;
      const length =
        end_s === undefined ? undefined : Math.max(0, end_s - start_s);
      source.onended = () => {
        if (cancelled) return;
        const offset = audioTimeToHost(
          audio,
          audio.currentTime,
          performance.now()
        );
        emit.current(
          {
            label: "stimulus_offset",
            kind: "stimulus",
            meta: { ...media, ...timingMeta("webaudio", offset.uncertaintyMs) },
          },
          offset.hostMs
        );
        finish({ duration_s: length ?? buffer.duration - start_s });
      };
      source.start(at, start_s, length);

      // Stamped with the scheduled start, SCHEDULE_AHEAD_S in the future.
      const onset = audioTimeToHost(audio, at, performance.now());
      emit.current(
        {
          label: "stimulus_onset",
          kind: "stimulus",
          meta: { ...media, ...timingMeta("webaudio", onset.uncertaintyMs) },
        },
        onset.hostMs
      );
      setState("playing");
    })().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
      try {
        source?.stop();
      } catch {
        // Never started: nothing to stop.
      }
      void audio.close();
    };
    // The clip is scheduled once per mount; a new config is a new step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "error")
    return (
      <Stage>
        <p className="max-w-xl text-ink-2">{t("common.media_error")}</p>
        <Button onClick={() => finish({ error: true })}>
          {t("common.continue")}
        </Button>
      </Stage>
    );
  return (
    <Stage>
      <p aria-live="polite" className="text-xl text-ink-2">
        {state === "loading" ? t("common.loading") : t("audio.listen")}
      </p>
    </Stage>
  );
}

export const audioTaskKind: TaskKind<AudioConfig> = {
  name: "audio",
  configSchema: audioConfigSchema,
  Renderer: AudioRenderer,
};
