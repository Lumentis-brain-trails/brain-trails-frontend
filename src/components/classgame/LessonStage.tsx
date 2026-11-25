"use client";

/**
 * A Learning module taught live: the teacher's screen shows the step the class is on,
 * the controls that move everyone (next question, next step, back), and how the class
 * is doing on the question that is out - how many got it right, wrong, or asked for the
 * answer, and how many have not answered yet. Counts only, never names (V4-0012).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleView } from "@/components/learning/ModuleView";
import { Button, Card, Segmented, cn } from "@/components/ui";
import type { useHostGame } from "@/lib/classgame/useClassGame";
import {
  type LessonPlace,
  VERDICTS,
  asLesson,
  countedAt,
  lessonRound,
  nextPlace,
  previousPlace,
} from "@/lib/classgame/lesson";
import { MODULES, moduleOf } from "@/lib/learning/modules";

type Host = ReturnType<typeof useHostGame>;

const READY = MODULES.filter((m) => m.steps.length > 0);

export function LessonStage({ game }: { game: Host }) {
  const t = useTranslations("classGame.lesson");
  const tm = useTranslations("learning.modules");
  const { view, askRound } = game;
  const live = game.socketState === "open";
  // the place the room holds wins (a reload, a second screen), else the first module
  const held = asLesson(view.question);
  const [place, setPlace] = useState<LessonPlace>(
    () => held ?? { module: READY[0]?.slug ?? "", step: 0, upTo: -1 }
  );
  const mod = moduleOf(place.module) ?? READY[0];

  const go = useCallback(
    (next: LessonPlace) => {
      const target = moduleOf(next.module);
      if (!target) return;
      setPlace(next);
      askRound(lessonRound(target, next));
    },
    [askRound]
  );

  // the first time the room is open with no lesson in it, put the class on our place
  const started = useRef(false);
  useEffect(() => {
    if (!live || started.current) return;
    started.current = true;
    if (!held && mod)
      askRound(lessonRound(mod, { ...place, module: mod.slug }));
  }, [live, held, mod, place, askRound]);

  if (!mod) return null;
  const step = mod.steps[place.step];
  const counted = countedAt(mod, place);
  const tally =
    held && view.tally && view.tally.question === held.id ? view.tally : null;
  const answered = tally?.votes ?? 0;
  const next = nextPlace(mod, place);
  const previous = previousPlace(mod, place);
  const moreQuestions = step && place.upTo + 1 < step.questions.length;

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label={t("module")}
            value={mod.slug}
            onChange={(slug) => go({ module: slug, step: 0, upTo: -1 })}
            options={READY.map((m) => ({
              value: m.slug,
              label: tm(`${m.key}.name`),
            }))}
          />
          <p className="text-ink-2">
            {t("where", {
              step: place.step + 1,
              steps: mod.steps.length,
              shown: Math.max(0, place.upTo + 1),
              questions: step?.questions.length ?? 0,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={!live || !previous}
            onClick={() => previous && go(previous)}
          >
            {t("back")}
          </Button>
          <Button disabled={!live || !next} onClick={() => next && go(next)}>
            {moreQuestions ? t("nextQuestion") : t("nextStep")}
          </Button>
        </div>

        {counted && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VERDICTS.map((v) => (
              <div
                key={v}
                className={cn(
                  "rounded-xl border p-3",
                  v === "right"
                    ? "border-ok bg-ok-soft"
                    : v === "wrong"
                      ? "border-warn bg-warn-soft"
                      : "border-hairline"
                )}
              >
                <p className="text-sm text-ink-2">{t(v)}</p>
                <p className="type-title tabular-nums">
                  {tally?.counts[v] ?? 0}
                </p>
              </div>
            ))}
            <div className="rounded-xl border border-hairline p-3">
              <p className="text-sm text-ink-2">{t("waiting")}</p>
              <p className="type-title tabular-nums">
                {Math.max(0, view.players - answered)}
              </p>
            </div>
          </div>
        )}
        {counted?.startsWith("lab:") && (
          <p className="text-sm text-ink-3">{t("labHint")}</p>
        )}
      </Card>

      <ModuleView
        module={mod}
        control={{ step: place.step, upTo: place.upTo, onVerdict: () => {} }}
      />
    </div>
  );
}
