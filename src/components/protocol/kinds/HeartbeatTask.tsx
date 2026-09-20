"use client";

/**
 * Heartbeat counting (Schandry 1981): between two tones, silently count your own
 * heartbeats without touching your pulse; then say how many, and how sure you are.
 *
 * The headband's optical sensor records the pulse on the same clock as these markers
 * (`extras.csv`, `ppg_*` streams), so the backend can count the beats that really
 * happened between `heartbeat_interval_start` and `heartbeat_interval_end` and score
 * `1 - |real - reported| / real` per interval: interoceptive accuracy. Confidence is
 * asked because how well the confidence tracks the accuracy (interoceptive awareness)
 * is a separate thing from the accuracy itself, and the more interesting one in anxiety.
 *
 * Intervals differ in length and come in a session-drawn order so that a participant
 * cannot simply estimate elapsed time times a guessed heart rate - the known weakness of
 * this task, reduced but not removed; the instruction says to count only beats that are
 * actually felt, which is the other half of the standard remedy.
 *
 * Both tones are scheduled on the Web Audio clock and stamped as `webaudio` stimuli; when
 * no audio is available the boundaries fall back to the frame after the screen changes.
 */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui";
import { UI_UNCERTAINTY_MS, timingMeta } from "@/lib/protocol/marker";
import { mulberry32 } from "@/lib/protocol/rng";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { FixationCross, Stage, playTone, useFinish, useLatest } from "./shared";

export const heartbeatConfigSchema = z.object({
  intervals_s: z
    .array(z.number().int().min(10).max(120))
    .min(1)
    .max(8)
    .default([25, 35, 45]),
  shuffle: z.boolean().default(true),
  confidence: z.boolean().default(true),
  ready_s: z.number().min(1).max(30).default(4),
});

export type HeartbeatConfig = z.infer<typeof heartbeatConfigSchema>;

type Stage_ = "ready" | "counting" | "report";

interface Report {
  interval_index: number;
  duration_s: number;
  reported_count: number;
  confidence: number | null;
}

function HeartbeatRenderer(ctx: TaskContext<HeartbeatConfig>) {
  const t = useTranslations("kinds");
  const {
    intervals_s,
    shuffle,
    confidence: askConfidence,
    ready_s,
  } = ctx.config;
  const finish = useFinish(ctx, "heartbeat");
  const emit = useLatest(ctx.emit);

  const order = useMemo(() => {
    const list = [...intervals_s];
    if (shuffle) {
      const rng = mulberry32(ctx.seed);
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    return list;
  }, [ctx.seed, intervals_s, shuffle]);

  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage_>("ready");
  const [count, setCount] = useState("");
  const [sure, setSure] = useState(5);
  const reports = useRef<Report[]>([]);
  const duration = order[index];

  useEffect(() => {
    if (stage === "report") return;
    const boundary = (label: string, then: () => void) => {
      // `boundary` is what the backend reads; the label is only a name (V3-0010)
      const meta = {
        interval_index: index,
        duration_s: duration,
        boundary: label.endsWith("_start") ? "start" : "end",
      };
      void playTone(stage === "ready" ? 660 : 440).then((onset) => {
        emit.current(
          {
            label,
            kind: "stimulus",
            meta: {
              ...meta,
              ...(onset
                ? timingMeta("webaudio", onset.uncertaintyMs)
                : timingMeta("ui", UI_UNCERTAINTY_MS)),
            },
          },
          onset?.hostMs
        );
        then();
      });
    };
    const timer = setTimeout(
      () =>
        stage === "ready"
          ? boundary("heartbeat_interval_start", () => setStage("counting"))
          : boundary("heartbeat_interval_end", () => setStage("report")),
      (stage === "ready" ? ready_s : duration) * 1000
    );
    return () => clearTimeout(timer);
  }, [duration, emit, index, ready_s, stage]);

  const submit = (atHostMs: number) => {
    const reported = Number.parseInt(count, 10);
    if (!Number.isFinite(reported) || reported < 0) return;
    const report: Report = {
      interval_index: index,
      duration_s: duration,
      reported_count: reported,
      confidence: askConfidence ? sure : null,
    };
    reports.current = [...reports.current, report];
    ctx.emit(
      { label: "heartbeat_report", kind: "response", meta: { ...report } },
      atHostMs
    );
    setCount("");
    setSure(5);
    if (index + 1 < order.length) {
      setIndex(index + 1);
      setStage("ready");
    } else {
      finish({ intervals: reports.current });
    }
  };

  if (stage !== "report") {
    return (
      <Stage>
        <FixationCross label={t("fixation.label")} />
        <p className="max-w-xl text-xl leading-relaxed text-ink-2">
          {stage === "ready" ? t("heartbeat.ready") : t("heartbeat.counting")}
        </p>
        <p className="type-caption text-ink-3">
          {t("heartbeat.progress", { n: index + 1, total: order.length })}
        </p>
      </Stage>
    );
  }

  return (
    <Stage>
      <label className="flex flex-col items-center gap-3 text-xl text-ink">
        {t("heartbeat.how_many")}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={400}
          autoFocus
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className="h-12 w-32 rounded-[var(--radius-control)] border border-hairline-strong bg-surface text-center text-2xl tabular-nums"
        />
      </label>
      {askConfidence && (
        <label className="flex w-full max-w-sm flex-col items-center gap-2 text-ink-2">
          {t("heartbeat.how_sure")}
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={sure}
            onChange={(event) => setSure(Number(event.target.value))}
            className="w-full"
          />
          <span className="flex w-full justify-between type-caption text-ink-3">
            <span>{t("heartbeat.guessing")}</span>
            <span>{t("heartbeat.certain")}</span>
          </span>
        </label>
      )}
      <Button
        disabled={count === ""}
        onClick={(event) => submit(event.timeStamp)}
      >
        {t("common.continue")}
      </Button>
    </Stage>
  );
}

export const heartbeatTaskKind: TaskKind<HeartbeatConfig> = {
  name: "heartbeat",
  configSchema: heartbeatConfigSchema,
  Renderer: HeartbeatRenderer,
};
