"use client";

/**
 * A student's side of the class game (flag `class_games`): the teacher's question on
 * the phone, one tap to vote (changeable until voting closes), then the right answer
 * and how the class voted. The running score is the student's own and stays on their
 * screen: nobody else sees it.
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LessonFollow } from "@/components/classgame/LessonFollow";
import { LiveButtons } from "@/components/classgame/LiveButtons";
import { LiveChoice } from "@/components/classgame/LiveChoice";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { asLesson, lessonVote } from "@/lib/classgame/lesson";
import { useMyGame, usePlayerGame } from "@/lib/classgame/useClassGame";
import { useFeature } from "@/lib/features";

export default function PlayPage() {
  const t = useTranslations("classGame.player");
  const enabled = useFeature("class_games");
  const mine = useMyGame();
  const open = mine.data?.open === true;
  // each time a game opens, a fresh socket
  const [round, setRound] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRound((r) => r + 1);
  }

  if (!enabled)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <EmptyState title={t("off")} />
      </main>
    );

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      {open ? (
        <PlayerStage key={round} />
      ) : mine.isPending && mine.fetchStatus !== "idle" ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <EmptyState title={t("none")} text={t("noneHint")} />
      )}
    </main>
  );
}

function PlayerStage() {
  const t = useTranslations("classGame.player");
  const game = usePlayerGame(true);
  const { view } = game;
  const lesson = asLesson(view.question);
  const [score, setScore] = useState({ right: 0, asked: 0 });
  const counted = useRef(new Set<string>());

  // a question counts once, when its answer is revealed
  useEffect(() => {
    const id = view.question?.id;
    // only a Learning choice has a right answer; a braid step is where the class went
    if (
      view.phase !== "revealed" ||
      !id ||
      !view.answer ||
      !view.question?.choice
    )
      return;
    if (counted.current.has(id)) return;
    counted.current.add(id);
    const right = view.mine === view.answer;
    setScore((s) => ({ right: s.right + (right ? 1 : 0), asked: s.asked + 1 }));
  }, [
    view.phase,
    view.question?.id,
    view.question?.choice,
    view.answer,
    view.mine,
  ]);

  if (view.ended)
    return (
      <EmptyState
        title={t("over")}
        text={
          score.asked > 0
            ? t("score", { right: score.right, asked: score.asked })
            : undefined
        }
      />
    );

  if (game.socketState !== "open" && !view.role)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-2">
        <Spinner />
        <p>{t("joining")}</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between text-sm text-ink-2">
        <span>{view.schoolName}</span>
        {score.asked > 0 && (
          <span className="tabular-nums">
            {t("score", { right: score.right, asked: score.asked })}
          </span>
        )}
      </header>

      {!view.question ? (
        <Card>
          <EmptyState title={t("in")} text={t("wait")} />
        </Card>
      ) : lesson ? (
        <LessonFollow
          round={lesson}
          revealed={view.phase === "revealed"}
          onVerdict={(question, verdict, answer) => {
            if (question === lesson.counts)
              game.vote(lessonVote(lesson, verdict, answer));
          }}
        />
      ) : !view.question.choice ? (
        <Card className="space-y-4">
          <LiveButtons
            round={view.question}
            phase={view.phase}
            answer={view.answer}
            mine={view.mine}
            onPick={(option) => game.vote(option)}
          />
          <p className="text-center text-ink-2" aria-live="polite">
            {view.phase === "revealed"
              ? t("moved")
              : view.mine
                ? t("voted")
                : t("vote")}
          </p>
        </Card>
      ) : (
        <Card className="space-y-4">
          <LiveChoice
            question={view.question.choice}
            phase={view.phase}
            answer={view.answer}
            tally={view.tally}
            showCount={false}
            mine={view.mine}
            onPick={(option) => game.vote(option)}
          />
          <p className="text-center text-ink-2" aria-live="polite">
            {status(t, view.phase, view.mine, view.answer)}
          </p>
        </Card>
      )}
      {game.socketState === "reconnecting" && (
        <p className="text-center text-sm text-warn">{t("reconnecting")}</p>
      )}
    </div>
  );
}

function status(
  t: ReturnType<typeof useTranslations<"classGame.player">>,
  phase: string | null,
  mine: string | null,
  answer: string | null
): string {
  if (phase === "revealed") {
    if (!answer) return t("poll");
    if (!mine) return t("missed");
    return mine === answer ? t("right") : t("wrong");
  }
  if (phase === "closed") return mine ? t("closedVoted") : t("closed");
  return mine ? t("voted") : t("vote");
}
