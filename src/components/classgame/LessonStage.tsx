"use client";

/**
 * A Learning module taught live: the teacher's screen shows the step the class is on,
 * the controls that move everyone (next question, next step, back), and how the class
 * is doing on the question that is out - how many got it right, wrong, or asked for the
 * answer, and how many have not answered yet. On a multiple-choice question "Show the
 * answers" puts how many chose each option on the projector, with the right one marked.
 * Counts only, never names (V4-0012). The module is chosen when the game starts and
 * stays (Andrea, 2026-11-25).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleView } from "@/components/learning/ModuleView";
import { LiveChoice } from "@/components/classgame/LiveChoice";
import { toWire } from "@/lib/classgame/game";
import { Button, Card, cn } from "@/components/ui";
import type { useHostGame } from "@/lib/classgame/useClassGame";
import {
  type LessonPlace,
  VERDICTS,
  asLesson,
  countedAt,
  countedQuestion,
  lessonRound,
  nextPlace,
  previousPlace,
  startPlace,
  verdictCounts,
} from "@/lib/classgame/lesson";
import { type LearningModule } from "@/lib/learning/modules";

type Host = ReturnType<typeof useHostGame>;

/**
 * Where the class is in `mod`, and the move that takes everyone elsewhere. Until the
 * teacher moves, the place is the room's (coming back to the page resumes the lesson),
 * else the module's start, which is put to the class once the room has said hello.
 */
export function useLesson(game: Host, mod: LearningModule) {
  const { view, askRound } = game;
  const roomHeld = asLesson(view.question);
  const held = roomHeld?.module === mod.slug ? roomHeld : null;
  const [moved, setMoved] = useState<LessonPlace | null>(null);
  const place: LessonPlace = moved ?? held ?? startPlace(mod);

  const go = useCallback(
    (next: LessonPlace) => {
      setMoved(next);
      askRound(lessonRound(mod, next));
    },
    [askRound, mod]
  );

  const started = useRef(false);
  const greeted = view.role === "host";
  useEffect(() => {
    if (!greeted || started.current) return;
    started.current = true;
    if (!held) askRound(lessonRound(mod, startPlace(mod)));
  }, [greeted, held, mod, askRound]);

  return { place, go };
}

export function LessonStage({
  game,
  module: mod,
  lesson,
}: {
  game: Host;
  module: LearningModule;
  lesson: ReturnType<typeof useLesson>;
}) {
  const t = useTranslations("classGame.lesson");
  const { view } = game;
  const live = game.socketState === "open";
  const { place, go: move } = lesson;
  // "Show the answers" is per question: a move closes it
  const [answersAt, setAnswersAt] = useState<string | null>(null);
  const go = (next: LessonPlace) => {
    setAnswersAt(null);
    move(next);
  };

  const step = mod.steps[place.step];
  const counted = countedAt(mod, place);
  const round = lessonRound(mod, place);
  const answers = answersAt === round.id;
  const tally =
    view.tally && view.tally.question === round.id ? view.tally : null;
  const answered = tally?.votes ?? 0;
  const question = countedQuestion(mod, place);
  const choice = question?.kind === "choice" ? question : null;
  const counts = verdictCounts(round, tally?.counts ?? {}, choice?.answer);
  const next = nextPlace(mod, place);
  const previous = previousPlace(mod, place);
  const moreQuestions = step && place.upTo + 1 < step.questions.length;

  return (
    <div className="space-y-5">
      {/* the class's answers stay in view while the teacher scrolls the step */}
      <Card className="sticky top-4 z-20 space-y-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          {choice && (
            <Button
              variant="ghost"
              onClick={() => setAnswersAt(answers ? null : round.id)}
            >
              {t(answers ? "hideAnswers" : "showAnswers")}
            </Button>
          )}
        </div>

        {counted && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {VERDICTS.map((v) => (
              <div
                key={v}
                className={cn(
                  "rounded-2xl border p-5",
                  v === "right"
                    ? "border-ok bg-ok-soft"
                    : v === "wrong"
                      ? "border-warn bg-warn-soft"
                      : "border-hairline"
                )}
              >
                <p className="type-subhead text-ink-2">{t(v)}</p>
                {/* re-mounted on every change, so each vote pops in live */}
                <p
                  key={counts[v]}
                  className="type-display enter-pop tabular-nums"
                >
                  {counts[v]}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-hairline p-5">
              <p className="type-subhead text-ink-2">{t("waiting")}</p>
              <p
                key={Math.max(0, view.players - answered)}
                className="type-display enter-pop tabular-nums"
              >
                {Math.max(0, view.players - answered)}
              </p>
            </div>
          </div>
        )}
        {counted?.startsWith("lab:") && (
          <p className="text-sm text-ink-3">{t("labHint")}</p>
        )}
      </Card>

      {choice && answers && (
        <Card className="enter-up">
          <LiveChoice
            question={toWire(choice).choice!}
            phase="revealed"
            answer={choice.answer}
            tally={pickTally(round.picks ?? [], tally)}
            showCount
            big
          />
        </Card>
      )}

      <ModuleView
        module={mod}
        control={{ step: place.step, upTo: place.upTo, onVerdict: () => {} }}
      />
    </div>
  );
}

/** The count over the options only (asking for the answer is not a choice). */
function pickTally(
  picks: string[],
  tally: { question: string | null; counts: Record<string, number> } | null
) {
  const counts: Record<string, number> = {};
  let votes = 0;
  for (const id of picks) {
    counts[id] = tally?.counts[id] ?? 0;
    votes += counts[id];
  }
  return { question: tally?.question ?? null, counts, votes };
}
