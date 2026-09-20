"use client";

/**
 * A quiz of JSON scenes: a prompt and its choices, one scene at a time.
 *
 * Each scene's onset is the first frame that shows it (`stimulus_onset`, rAF-timed) and
 * each answer is a `response` marker stamped with the click's own event time, so the
 * reaction time is frame-to-input on one clock rather than handler-to-handler.
 */

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { type QuizConfig, quizConfigSchema } from "@/lib/protocol/blocks";
import { FRAME_MS, timingMeta } from "@/lib/protocol/marker";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useFirstFrame } from "./shared";

interface Answer {
  scene: number;
  choice: number;
  correct: boolean | null;
  reaction_time_ms: number | null;
}

function QuizRenderer(ctx: TaskContext<QuizConfig>) {
  const t = useTranslations("kinds");
  const { scenes, feedback } = ctx.config;
  const finish = useFinish(ctx, "quiz");
  const [index, setIndex] = useState(0);
  const [shownFeedback, setShownFeedback] = useState<boolean | null>(null);
  const answersRef = useRef<Answer[]>([]);
  const onsetRef = useRef<number | null>(null);
  const scene = scenes[index];

  useFirstFrame(
    shownFeedback === null,
    (hostMs) => {
      onsetRef.current = hostMs;
      ctx.emit(
        {
          label: "stimulus_onset",
          kind: "stimulus",
          meta: { scene_index: index, ...timingMeta("raf", FRAME_MS) },
        },
        hostMs
      );
    },
    index
  );

  const next = () => {
    setShownFeedback(null);
    if (index + 1 < scenes.length) {
      setIndex(index + 1);
      return;
    }
    const answers = answersRef.current;
    const scored = answers.filter((a) => a.correct !== null);
    finish({
      answers,
      score: scored.filter((a) => a.correct).length,
      scored: scored.length,
    });
  };

  const answer = (choice: number, atHostMs: number) => {
    const correct =
      scene.correct === undefined ? null : scene.correct === choice;
    const rt = onsetRef.current === null ? null : atHostMs - onsetRef.current;
    answersRef.current = [
      ...answersRef.current,
      { scene: index, choice, correct, reaction_time_ms: rt },
    ];
    ctx.emit(
      {
        label: "response",
        kind: "response",
        meta: {
          scene_index: index,
          choice_index: choice,
          choice_label: scene.choices[choice],
          ...(correct === null ? {} : { correct }),
          ...(rt === null ? {} : { reaction_time_ms: rt }),
        },
      },
      atHostMs
    );
    onsetRef.current = null;
    if (feedback && correct !== null) setShownFeedback(correct);
    else next();
  };

  return (
    <Stage>
      <p className="type-caption text-ink-3">
        {t("quiz.progress", { n: index + 1, total: scenes.length })}
      </p>
      <p className="max-w-xl text-xl leading-relaxed whitespace-pre-line text-ink">
        {scene.prompt}
      </p>
      {shownFeedback === null ? (
        <div className="grid w-full max-w-md gap-3">
          {scene.choices.map((choice, i) => (
            <Button
              key={`${index}-${i}`}
              variant="ghost"
              className="border border-hairline"
              onClick={(event) => answer(i, event.timeStamp)}
            >
              {choice}
            </Button>
          ))}
        </div>
      ) : (
        <>
          <p aria-live="polite" className="text-lg text-ink">
            {shownFeedback ? t("quiz.correct") : t("quiz.incorrect")}
          </p>
          <Button onClick={next}>{t("quiz.next")}</Button>
        </>
      )}
    </Stage>
  );
}

export const quizTaskKind: TaskKind<QuizConfig> = {
  name: "quiz",
  configSchema: quizConfigSchema,
  Renderer: QuizRenderer,
};
