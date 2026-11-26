"use client";

/**
 * The teacher's class game, for the projector (flag `class_games`, backend
 * `docs/api/class-game.md`).
 *
 * The teacher chooses what the class does when the game starts - a Learning module
 * taught live, the braided path, or single questions - and stays on it until the game
 * ends (Andrea, 2026-11-25). The choice is the room's `plan`, kept by the server: the
 * teacher may go elsewhere in the app while the game runs and come back to "Resume",
 * here or from the School page. Votes are counted, never named: the teacher reads no
 * student's own (V4-0012).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { BraidStage } from "@/components/classgame/BraidStage";
import { LessonStage, useLesson } from "@/components/classgame/LessonStage";
import { LiveChoice } from "@/components/classgame/LiveChoice";
import { useWords } from "@/components/learning/QuestionCard";
import { Button, Card, EmptyState, Icon, Skeleton, cn } from "@/components/ui";
import { liveQuestions } from "@/lib/classgame/game";
import { firstUpTo } from "@/lib/classgame/lesson";
import { useGameState, useHostGame } from "@/lib/classgame/useClassGame";
import { api } from "@/lib/api";
import { useAppConfig, useFeature } from "@/lib/features";
import { type LearningModule, MODULES, moduleOf } from "@/lib/learning/modules";

/** What a game runs: `lesson:<module slug>`, `braid` or `questions`. */
export type Plan = string;

const READY = MODULES.filter((m) => m.steps.length > 0);

/** The module a plan teaches, or null for the other games. */
export function planModule(plan: Plan | null): LearningModule | null {
  return plan?.startsWith("lesson:") ? moduleOf(plan.slice(7)) : null;
}

export default function ClassGamePage() {
  const t = useTranslations("classGame.host");
  const tm = useTranslations("learning.modules");
  const { school } = useParams<{ school: string }>();
  const enabled = useFeature("class_games");
  const config = useAppConfig();
  const queryClient = useQueryClient();
  const state = useGameState(school, enabled);
  // the plan being played on this screen; null: the start screen
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ended, setEnded] = useState(false);
  const available = !!config.data?.live_url;

  if (!enabled)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState title={t("off")} />
      </main>
    );

  if (plan)
    return (
      <HostStage
        key={plan}
        school={school}
        plan={plan}
        onEnded={() => {
          setEnded(true);
          setPlan(null);
          queryClient.invalidateQueries({ queryKey: ["school", school] });
        }}
      />
    );

  const running = state.data?.open && !ended ? state.data : null;
  const start = (p: Plan) => {
    setEnded(false);
    setPlan(p);
  };
  const endRunning = async () => {
    await api.delete(`schools/${school}/game`);
    queryClient.invalidateQueries({ queryKey: ["school", school] });
  };
  const choice = (p: Plan, title: string, from: string) => (
    <button
      key={p}
      type="button"
      disabled={!available}
      onClick={() => start(p)}
      className="pressable w-full rounded-2xl border border-hairline px-4 py-3 text-left hover:bg-surface-2 disabled:opacity-50"
    >
      <span className="block text-sm text-ink-3">{from}</span>
      <span className="type-subhead">{title}</span>
    </button>
  );
  const runningName = (p: Plan | null) => {
    const mod = planModule(p);
    if (mod) return t("teach", { module: tm(`${mod.key}.name`) });
    return p === "braid" ? t("braid") : t("questionsGame");
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <BackLink className="text-sm text-ink-2" />
      <Card className="space-y-4">
        <h1 className="type-title">{t("title")}</h1>
        <p className="text-pretty text-ink-2">{t("intro")}</p>
        <p className="text-pretty text-sm text-ink-3">{t("privacy")}</p>
        {ended && <p className="text-ink-2">{t("ended")}</p>}
        {!available && <p className="text-sm text-warn">{t("unavailable")}</p>}
      </Card>

      {state.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : running ? (
        <Card className="space-y-4">
          <p className="type-eyebrow text-ink-3">{t("running")}</p>
          <p className="type-subhead">{runningName(running.plan)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!available}
              onClick={() => start(running.plan ?? `lesson:${READY[0].slug}`)}
            >
              {t("resume")}
            </Button>
            <Button variant="ghost" onClick={endRunning}>
              {t("end")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="type-eyebrow text-ink-3">{t("choose")}</p>
          {READY.map((m) =>
            choice(
              `lesson:${m.slug}`,
              t("teach", { module: tm(`${m.key}.name`) }),
              t("lessonFrom")
            )
          )}
          {choice("braid", t("braid"), t("braidFrom"))}
          {choice("questions", t("questionsGame"), t("questionsFrom"))}
        </Card>
      )}
    </main>
  );
}

/**
 * The narrow strip at the left of the stage: it opens over the stage on hover or focus,
 * so the votes and the class keep the room (Andrea, 2026-11-25).
 */
function HoverIndex({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <aside className="group relative z-30" aria-label={label}>
      <div className="sticky top-8 flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-surface text-ink-2">
        <Icon name="menu" />
      </div>
      <div className="invisible absolute top-0 left-0 max-h-[calc(100vh-4rem)] w-80 space-y-3 overflow-y-auto rounded-2xl border border-hairline bg-surface p-4 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {children}
      </div>
    </aside>
  );
}

const indexItem = (active: boolean) =>
  cn(
    "pressable w-full rounded-xl border px-3 py-2 text-left text-sm",
    active
      ? "border-accent bg-accent-soft"
      : "border-hairline hover:bg-surface-2"
  );

/** The game on the projector: the header, the index, and the plan's stage. */
function HostStage({
  school,
  plan,
  onEnded,
}: {
  school: string;
  plan: Plan;
  onEnded: () => void;
}) {
  const t = useTranslations("classGame.host");
  const game = useHostGame(school, true, plan);
  const { view } = game;
  const live = game.socketState === "open";
  const mod = planModule(plan);
  useEffect(() => {
    if (view.ended || game.socketState === "closed") onEnded();
  }, [view.ended, game.socketState, onEnded]);

  return (
    <main
      className={cn(
        "mx-auto grid w-full max-w-[96rem] gap-6 px-6 py-8",
        plan === "braid" ? "grid-cols-1" : "grid-cols-[3rem_1fr]"
      )}
    >
      {mod ? (
        <LessonPlan game={game} mod={mod} />
      ) : plan === "braid" ? (
        <section className="space-y-5">
          <StageHeader game={game} live={live} />
          <BraidStage game={game} />
        </section>
      ) : (
        <QuestionsPlan game={game} live={live} t={t} />
      )}
    </main>
  );
}

type Host = ReturnType<typeof useHostGame>;

/** Who is connected, how many voted, and the way out. */
function StageHeader({ game, live }: { game: Host; live: boolean }) {
  const t = useTranslations("classGame.host");
  const { view } = game;
  return (
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
      </div>
      <Button size="sm" variant="ghost" onClick={() => game.end()}>
        {t("end")}
      </Button>
    </header>
  );
}

/** A module taught live: its steps in the index, the lesson on the stage. */
function LessonPlan({ game, mod }: { game: Host; mod: LearningModule }) {
  const t = useTranslations("classGame.lesson");
  const words = useWords();
  const lesson = useLesson(game, mod);
  const live = game.socketState === "open";
  return (
    <>
      <HoverIndex label={t("steps")}>
        <p className="type-eyebrow text-ink-3">{t("steps")}</p>
        <ol className="space-y-1.5">
          {mod.steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!live}
                onClick={() =>
                  lesson.go({
                    module: mod.slug,
                    step: i,
                    upTo: firstUpTo(mod, i),
                  })
                }
                className={indexItem(lesson.place.step === i)}
              >
                <span className="mr-2 text-ink-3 tabular-nums">{i + 1}</span>
                {words.text({ key: `${mod.key}.steps.${s.id}.title` })}
              </button>
            </li>
          ))}
        </ol>
      </HoverIndex>
      <section className="space-y-5">
        <StageHeader game={game} live={live} />
        <LessonStage game={game} module={mod} lesson={lesson} />
      </section>
    </>
  );
}

/** Single questions from every module, asked one at a time with live bars. */
function QuestionsPlan({
  game,
  live,
  t,
}: {
  game: Host;
  live: boolean;
  t: ReturnType<typeof useTranslations<"classGame.host">>;
}) {
  const tm = useTranslations("learning.modules");
  const words = useWords();
  const [showCount, setShowCount] = useState(true);
  const { view } = game;
  const entries = useMemo(() => liveQuestions(MODULES), []);
  const current = view.question?.id ?? null;
  const index = entries.findIndex((e) => e.question.id === current);
  const next = entries[index + 1] ?? null;
  return (
    <>
      <HoverIndex label={t("questions")}>
        <p className="type-eyebrow text-ink-3">{t("questions")}</p>
        <ol className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.question.id}>
              <button
                type="button"
                disabled={!live}
                onClick={() => game.ask(e.question)}
                className={indexItem(e.question.id === current)}
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
      </HoverIndex>
      <section className="space-y-5">
        <StageHeader game={game} live={live} />
        {!view.question?.choice ? (
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
            {view.tally && (
              <p className="type-title text-ink-3">
                {t("voted", { n: view.tally.votes })}
              </p>
            )}
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
    </>
  );
}
