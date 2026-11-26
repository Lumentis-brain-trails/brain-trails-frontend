"use client";

/**
 * A Learning module taught live: the teacher's screen shows the step the class is on,
 * the controls that move everyone (back, reveal, next), and how many have answered the
 * question that is out. Until the teacher reveals it nobody learns whether they were
 * right: the board shows only how many answered (the right/wrong split waits under the
 * teacher's pointer) and the phones no verdict (Andrea, 2026-11-26). The reveal closes
 * the vote, puts right, wrong and shown on the board, how many chose each option on a
 * multiple-choice question, and on the step's last question opens "What we found".
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
  revealedUpTo,
  startPlace,
  stepRevealed,
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
  const { place, go } = lesson;

  const step = mod.steps[place.step];
  const counted = countedAt(mod, place);
  const round = lessonRound(mod, place);
  const tally =
    view.tally && view.tally.question === round.id ? view.tally : null;
  const answered = tally?.votes ?? 0;
  const waiting = Math.max(0, view.players - answered);
  const question = countedQuestion(mod, place);
  const choice = question?.kind === "choice" ? question : null;
  const counts = verdictCounts(round, tally?.counts ?? {}, choice?.answer);
  // the room's phase is this round's only while the room holds it
  const phase = view.question?.id === round.id ? view.phase : null;
  const revealedNow = phase === "revealed";
  // where the class is, with what was revealed here, so a move carries it along
  const here: LessonPlace = { ...place, revealed: revealedUpTo(place, phase) };
  const next = nextPlace(mod, here);
  const previous = previousPlace(mod, here);
  const moreQuestions = step && place.upTo + 1 < step.questions.length;
  // whether the right answer is still the teacher's alone: a question out, not revealed
  const secret = !!question && !revealedNow;
  // a step without questions may still hold something back for the teacher to open
  const heldBack =
    !!step &&
    step.questions.length === 0 &&
    (!!step.gallery ||
      !!step.playground ||
      ("reveal" in step && !!step.reveal));
  const control = {
    step: place.step,
    upTo: place.upTo,
    revealedUpTo: here.revealed,
    reveal: stepRevealed(mod, place, phase),
    onVerdict: () => {},
  };

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
          {(question || heldBack) && (
            <Button
              variant="secondary"
              disabled={!live || revealedNow}
              onClick={() => game.reveal(null)}
            >
              {question
                ? t(revealedNow ? "answerRevealed" : "revealAnswer")
                : t(revealedNow ? "foundShown" : "showFound")}
            </Button>
          )}
          <Button disabled={!live || !next} onClick={() => next && go(next)}>
            {moreQuestions ? t("nextQuestion") : t("nextStep")}
          </Button>
        </div>

        {counted && secret && (
          // before the reveal the board shows only how many answered: the split
          // would give the answer away on the projector, so it waits under the pointer
          <div className="grid grid-cols-2 gap-4">
            <div className="group rounded-2xl border border-hairline p-5">
              <p className="type-subhead text-ink-2">{t("answered")}</p>
              <p key={answered} className="type-display enter-pop tabular-nums">
                {answered}
              </p>
              <p className="mt-1 text-sm text-ink-3 tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                {VERDICTS.map((v) => `${t(v)} ${counts[v]}`).join(" · ")}
              </p>
            </div>
            <div className="rounded-2xl border border-hairline p-5">
              <p className="type-subhead text-ink-2">{t("waiting")}</p>
              <p key={waiting} className="type-display enter-pop tabular-nums">
                {waiting}
              </p>
            </div>
          </div>
        )}
        {counted && !secret && (
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
              <p key={waiting} className="type-display enter-pop tabular-nums">
                {waiting}
              </p>
            </div>
          </div>
        )}
        {counted?.startsWith("lab:") && (
          <p className="text-sm text-ink-3">{t("labHint")}</p>
        )}
      </Card>

      {choice && revealedNow && (
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

      <ModuleView module={mod} control={control} />
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
