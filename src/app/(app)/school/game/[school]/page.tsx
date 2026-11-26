"use client";

/**
 * The teacher's class game, for the projector (flag `class_games`, backend
 * `docs/api/class-game.md`).
 *
 * The Learning modules' multiple-choice questions are listed by module and step; the
 * teacher puts one on the screen, the class votes from their phones, the bars fill as
 * votes come in (hidden with one tap, so the first votes do not steer the rest), and
 * the reveal shows the right answer and the count on every screen. Votes are counted,
 * never named: the teacher reads no student's own (V4-0012).
 */
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { BraidStage } from "@/components/classgame/BraidStage";
import { LessonStage } from "@/components/classgame/LessonStage";
import { LiveChoice } from "@/components/classgame/LiveChoice";
import { useWords } from "@/components/learning/QuestionCard";
import { Button, Card, EmptyState, Icon, cn } from "@/components/ui";
import { liveQuestions } from "@/lib/classgame/game";
import { useHostGame } from "@/lib/classgame/useClassGame";
import { useAppConfig, useFeature } from "@/lib/features";
import { MODULES } from "@/lib/learning/modules";

export default function ClassGamePage() {
  const t = useTranslations("classGame.host");
  const { school } = useParams<{ school: string }>();
  const enabled = useFeature("class_games");
  const config = useAppConfig();
  // 0 before the first start; each start mounts a fresh stage (and socket)
  const [round, setRound] = useState(0);
  const [ended, setEnded] = useState(false);
  const available = !!config.data?.live_url;

  if (!enabled)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState title={t("off")} />
      </main>
    );

  if (round > 0 && !ended)
    return (
      <HostStage key={round} school={school} onEnded={() => setEnded(true)} />
    );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <BackLink className="text-sm text-ink-2" />
      <Card className="space-y-4">
        <h1 className="type-title">{t("title")}</h1>
        <p className="text-pretty text-ink-2">{t("intro")}</p>
        <p className="text-pretty text-sm text-ink-3">{t("privacy")}</p>
        {ended && <p className="text-ink-2">{t("ended")}</p>}
        <Button
          onClick={() => {
            setEnded(false);
            setRound((r) => r + 1);
          }}
          disabled={!available}
        >
          {t(ended ? "again" : "start")}
        </Button>
        {!available && <p className="text-sm text-warn">{t("unavailable")}</p>}
      </Card>
    </main>
  );
}

/** The game on the projector: the question list, the question, the controls. */
function HostStage({
  school,
  onEnded,
}: {
  school: string;
  onEnded: () => void;
}) {
  const t = useTranslations("classGame.host");
  const tm = useTranslations("learning.modules");
  const words = useWords();
  const [showCount, setShowCount] = useState(true);
  const [mode, setMode] = useState<"questions" | "braid" | "lesson">("lesson");
  const game = useHostGame(school, true);
  const { view } = game;
  const entries = useMemo(() => liveQuestions(MODULES), []);
  const current = view.question?.id ?? null;
  const index = entries.findIndex((e) => e.question.id === current);
  const next = entries[index + 1] ?? null;
  const live = game.socketState === "open";
  useEffect(() => {
    if (view.ended || game.socketState === "closed") onEnded();
  }, [view.ended, game.socketState, onEnded]);

  return (
    <main className="mx-auto grid w-full max-w-[96rem] grid-cols-[3rem_1fr] gap-6 px-6 py-8">
      {/* The index: a narrow strip that opens over the stage on hover or focus, so the
          votes and the class keep the room (Andrea, 2026-11-25). */}
      <aside className="group relative z-30" aria-label={t("index")}>
        <div className="sticky top-8 flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-surface text-ink-2">
          <Icon name="menu" />
        </div>
        <div className="invisible absolute top-0 left-0 w-80 space-y-3 rounded-2xl border border-hairline bg-surface p-4 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <p className="type-eyebrow text-ink-3">{t("games")}</p>
          <button
            type="button"
            onClick={() => setMode("lesson")}
            className={cn(
              "pressable w-full rounded-xl border px-3 py-2 text-left text-sm",
              mode === "lesson"
                ? "border-accent bg-accent-soft"
                : "border-hairline hover:bg-surface-2"
            )}
          >
            <span className="block text-xs text-ink-3">{t("lessonFrom")}</span>
            <span>{t("lesson")}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("braid")}
            className={cn(
              "pressable w-full rounded-xl border px-3 py-2 text-left text-sm",
              mode === "braid"
                ? "border-accent bg-accent-soft"
                : "border-hairline hover:bg-surface-2"
            )}
          >
            <span className="block text-xs text-ink-3">{t("braidFrom")}</span>
            <span>{t("braid")}</span>
          </button>
          <p className="type-eyebrow pt-3 text-ink-3">{t("questions")}</p>
          <ol className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.question.id}>
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => {
                    setMode("questions");
                    game.ask(e.question);
                  }}
                  className={cn(
                    "pressable w-full rounded-xl border px-3 py-2 text-left text-sm",
                    e.question.id === current
                      ? "border-accent bg-accent-soft"
                      : "border-hairline hover:bg-surface-2"
                  )}
                >
                  <span className="block text-xs text-ink-3">
                    {t("from", {
                      module: tm(`${e.module.key}.name`),
                      step: e.step + 1,
                    })}
                  </span>
                  <span className="line-clamp-2">
                    {words.rich(e.question.prompt)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <section className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span
              className={cn("h-4 w-4 rounded-full", live ? "bg-ok" : "bg-warn")}
              aria-hidden
            />
            {live ? (
              <span className="type-title">
                {t.rich("playersBig", {
                  n: view.players,
                  b: (chunks) => (
                    <span className="type-display tabular-nums">{chunks}</span>
                  ),
                })}
              </span>
            ) : (
              <span className="text-ink-2">{t("connecting")}</span>
            )}
            {view.tally && view.question && (
              <span className="type-title text-ink-3">
                {t("voted", { n: view.tally.votes })}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => game.end()}>
            {t("end")}
          </Button>
        </header>

        {mode === "lesson" ? (
          <LessonStage game={game} />
        ) : mode === "braid" ? (
          <BraidStage game={game} />
        ) : !view.question?.choice ? (
          <Card>
            <EmptyState
              title={t("pick")}
              text={t("pickHint")}
              action={
                entries[0] && (
                  <Button
                    disabled={!live}
                    onClick={() => game.ask(entries[0].question)}
                  >
                    {t("first")}
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <Card className="space-y-6">
            <LiveChoice
              question={view.question.choice}
              phase={view.phase}
              answer={view.answer}
              tally={view.tally}
              showCount={showCount}
              big
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
              {view.phase === "open" && (
                <Button variant="secondary" onClick={() => game.close()}>
                  {t("close")}
                </Button>
              )}
              {view.phase === "closed" && (
                <Button variant="secondary" onClick={() => game.reopen()}>
                  {t("reopen")}
                </Button>
              )}
              {view.phase !== "revealed" && (
                <Button onClick={() => game.reveal()}>{t("reveal")}</Button>
              )}
              {view.phase === "revealed" && next && (
                <Button onClick={() => game.ask(next.question)}>
                  {t("next")}
                </Button>
              )}
              {view.phase !== "revealed" && (
                <Button variant="ghost" onClick={() => setShowCount((v) => !v)}>
                  <Icon name={showCount ? "close" : "check"} />
                  {t(showCount ? "hideCount" : "showCount")}
                </Button>
              )}
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}
