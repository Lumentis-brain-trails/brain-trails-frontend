"use client";

/**
 * A Learning module, one step at a time: the step's words, then its pictures (a gallery
 * of nine, one figure, the heartbeat taken apart), the sliders that decode by hand, and
 * the questions.
 *
 * The step is in the address (`?step=7`, counted from one) so a teacher can send the
 * whole class to the same screen, and the browser's back button walks the steps. The
 * three questions every step returns to - how many numbers, which values, how to rebuild
 * - stay pinned above the content as the module's refrain.
 *
 * A step's questions come one at a time: the next shows once the one before is right or
 * its answer shown. In a teacher-paced lesson (`control`) the teacher's screen decides
 * instead: the step and how many of its questions are out, with no way to wander off,
 * and every verdict (and a lab's reached goal, as `lab:<step id>`) goes back to the room,
 * while the student sees no right or wrong until the teacher reveals the question.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EcgExplorer } from "@/components/learning/EcgExplorer";
import { Gallery } from "@/components/learning/Gallery";
import {
  NEURON_LABS,
  NeuronLab,
  type NeuronLabName,
} from "@/components/learning/NeuronLabs";
import { BraidLab } from "@/components/learning/BraidBoard";
import { BallLab, CityLab } from "@/components/learning/PlasticityLabs";
import { LearningFigure } from "@/components/learning/LearningFigure";
import { Playground } from "@/components/learning/Playground";
import { QuestionCard, useWords } from "@/components/learning/QuestionCard";
import { Card, EmptyState, Icon, buttonClass, cn } from "@/components/ui";
import { type LearningModule, stepIndex } from "@/lib/learning/modules";
import type { Answer } from "@/lib/learning/questions";

/** What a teacher-paced lesson hands the module: see `ModuleView`. */
export interface ModuleControl {
  /**
   * Show what the step held back (its "What we found" box, the gallery's codes, the
   * playground). In a teacher-paced lesson only this opens it, never a student's own
   * answers: the teacher shows it to the whole class at once.
   */
  reveal?: boolean;
  /**
   * The step's questions whose answers the teacher has revealed: `0..revealedUpTo`
   * (undefined: none). A later question only takes the answer, with no right or wrong,
   * until it is revealed (Andrea, 2026-11-26: the class sees it at the reveal).
   */
  revealedUpTo?: number;
  /**
   * The teacher's own screen: questions are shown, never answered (no Send, no Check),
   * and a revealed one shows its solution. Labs stay live for a demonstration.
   */
  presenter?: boolean;
  /** The step on screen, counted from zero. */
  step: number;
  /** The last question out (from zero); -1 shows the step without questions. */
  upTo: number;
  onVerdict: (
    questionId: string,
    verdict: "right" | "wrong" | "shown",
    answer?: Answer
  ) => void;
}

type Verdict = "right" | "wrong" | "shown";

export function ModuleView({
  module,
  control,
}: {
  module: LearningModule;
  control?: ModuleControl;
}) {
  const t = useTranslations("learning");
  const words = useWords();
  const router = useRouter();
  const params = useSearchParams();
  const at = control
    ? Math.min(Math.max(0, control.step), module.steps.length - 1)
    : stepIndex(params.get("step"), module.steps.length);
  // the verdicts of this step's questions, by id; a new step starts empty
  const [verdicts, setVerdicts] = useState<{
    step: number;
    of: Record<string, Verdict>;
  }>({ step: at, of: {} });
  const seen = verdicts.step === at ? verdicts.of : {};
  const heard = (id: string, v: Verdict, answer?: Answer) => {
    setVerdicts((prev) => ({
      step: at,
      of: { ...(prev.step === at ? prev.of : {}), [id]: v },
    }));
    control?.onVerdict(id, v, answer);
  };
  const step = module.steps[at];
  const href = (i: number) => `/learning/${module.slug}?step=${i + 1}`;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [at]);

  useEffect(() => {
    if (control) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" && at < module.steps.length - 1)
        router.push(href(at + 1));
      if (e.key === "ArrowLeft" && at > 0) router.push(href(at - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = (
    <header className="mb-6">
      <Link
        href="/learning"
        className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"
      >
        <Icon name="back" /> {t("title")}
      </Link>
      <p className="type-eyebrow mt-4 text-ink-3">
        {t(`modules.${module.key}.name`)}
      </p>
    </header>
  );

  if (!step)
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {header}
        <EmptyState title={t(`modules.${module.key}.name`)} text={t("soon")} />
      </main>
    );

  const key = `${module.key}.steps.${step.id}`;
  const labGoal = () => heard(`lab:${step.id}`, "right");
  // solo: up to the first question not yet right or shown; paced: what the teacher allows
  const firstOpen = step.questions.findIndex(
    (q) => seen[q.id] !== "right" && seen[q.id] !== "shown"
  );
  // what would give the answers away (codes, sliders, the explanation) waits for them
  // in a teacher-paced lesson only the teacher opens it, for the whole class at once
  const answered = control ? control.reveal === true : firstOpen === -1;
  const out = control
    ? control.upTo + 1
    : firstOpen === -1
      ? step.questions.length
      : firstOpen + 1;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {header}

      {!control && (
        <nav
          aria-label={t("steps")}
          className="mb-6 flex flex-wrap items-center gap-1.5"
        >
          {module.steps.map((s, i) => (
            <Link
              key={s.id}
              href={href(i)}
              aria-current={i === at ? "step" : undefined}
              title={words.text({ key: `${module.key}.steps.${s.id}.title` })}
              className={cn(
                "pressable flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-medium tabular-nums",
                i === at
                  ? "bg-accent text-on-accent"
                  : i < at
                    ? "bg-accent-soft text-ink"
                    : "bg-surface-2 text-ink-3"
              )}
            >
              {i + 1}
            </Link>
          ))}
        </nav>
      )}

      {module.refrain && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          {(["count", "values", "decode"] as const).map((q) => (
            <div
              key={q}
              className="rounded-xl border border-hairline px-3 py-2 text-center"
            >
              <span className="type-caption text-ink-2">
                {t(`refrain.${q}`)}
              </span>
            </div>
          ))}
        </div>
      )}

      <article className="space-y-6">
        <div>
          <h1 className="type-title">{words.text({ key: `${key}.title` })}</h1>
          <div className="type-body-lg mt-3 max-w-3xl space-y-3 text-pretty text-ink-2">
            {words.rich({ key: `${key}.body` })}
          </div>
        </div>

        {step.figure && !step.figureAnswers && (
          <Card className="p-3 sm:p-4">
            <LearningFigure spec={step.figure} className="mx-auto max-w-3xl" />
          </Card>
        )}
        {step.lab === "ecg" && <EcgExplorer />}
        {/* in a lesson the class plays one shared braid, run by the teacher's screen */}
        {step.lab === "braid" && !control && <BraidLab />}
        {step.lab === "city" && <CityLab />}
        {step.lab === "ballHard" && <BallLab worlds={["rocking", "stuck"]} />}
        {step.lab === "ballRestless" && <BallLab worlds={["restless"]} />}
        {step.lab === "ballSoft" && <BallLab worlds={["soft"]} />}
        {step.lab === "ballWind" && <BallLab worlds={["wind"]} />}
        {step.lab && NEURON_LABS.has(step.lab) && (
          <NeuronLab lab={step.lab as NeuronLabName} onGoal={labGoal} />
        )}
        {step.gallery && <Gallery examples={step.gallery} locked={!answered} />}
        {step.links && (
          <div className="flex flex-wrap gap-2">
            {step.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={buttonClass("primary")}
              >
                {words.text(l.words)}
              </Link>
            ))}
          </div>
        )}

        {step.questions.slice(0, out).map((q, i) => (
          <QuestionCard
            key={`${step.id}-${q.id}`}
            presenter={control?.presenter === true}
            feedback={
              !control
                ? "now"
                : i <= (control.revealedUpTo ?? -1)
                  ? "revealed"
                  : "held"
            }
            question={q}
            index={i}
            onVerdict={(v, a) => heard(q.id, v, a)}
          />
        ))}

        {answered && step.reveal && (
          <section className="learning-right space-y-2 rounded-[var(--radius-card)] border border-ok bg-ok-soft p-5">
            <p className="type-eyebrow text-ok">{t("revealTitle")}</p>
            <div className="type-body-lg space-y-3 text-pretty text-ink">
              {words.rich({ key: `${key}.reveal` })}
            </div>
          </section>
        )}
        {answered && step.figure && step.figureAnswers && (
          <Card className="p-3 sm:p-4">
            <LearningFigure spec={step.figure} className="mx-auto max-w-3xl" />
          </Card>
        )}
        {answered && step.playground && <Playground spec={step.playground} />}
      </article>

      {!control && (
        <footer className="mt-10 flex items-center justify-between gap-3 border-t border-hairline pt-6">
          {at > 0 ? (
            <Link href={href(at - 1)} className={buttonClass("secondary")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="type-caption text-ink-3">
            {t("stepOf", { n: at + 1, total: module.steps.length })}
          </span>
          {at < module.steps.length - 1 ? (
            <Link href={href(at + 1)} className={buttonClass("primary")}>
              {t("next")}
            </Link>
          ) : (
            <Link href="/learning" className={buttonClass("primary")}>
              {t("finish")}
            </Link>
          )}
        </footer>
      )}
    </main>
  );
}
