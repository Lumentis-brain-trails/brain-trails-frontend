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
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { EcgExplorer } from "@/components/learning/EcgExplorer";
import { Gallery } from "@/components/learning/Gallery";
import { LearningFigure } from "@/components/learning/LearningFigure";
import { Playground } from "@/components/learning/Playground";
import { QuestionCard, useWords } from "@/components/learning/QuestionCard";
import { Card, EmptyState, Icon, buttonClass, cn } from "@/components/ui";
import { type LearningModule, stepIndex } from "@/lib/learning/modules";

export function ModuleView({ module }: { module: LearningModule }) {
  const t = useTranslations("learning");
  const words = useWords();
  const router = useRouter();
  const params = useSearchParams();
  const at = stepIndex(params.get("step"), module.steps.length);
  const step = module.steps[at];
  const href = (i: number) => `/learning/${module.slug}?step=${i + 1}`;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [at]);

  useEffect(() => {
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
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {header}

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

      <div className="mb-6 grid grid-cols-3 gap-2">
        {(["count", "values", "decode"] as const).map((q) => (
          <div
            key={q}
            className="rounded-xl border border-hairline px-3 py-2 text-center"
          >
            <span className="type-caption text-ink-2">{t(`refrain.${q}`)}</span>
          </div>
        ))}
      </div>

      <article className="space-y-6">
        <div>
          <h1 className="type-title">{words.text({ key: `${key}.title` })}</h1>
          <div className="type-body-lg mt-3 max-w-3xl space-y-3 text-pretty text-ink-2">
            {words.rich({ key: `${key}.body` })}
          </div>
        </div>

        {step.figure && (
          <Card className="p-3 sm:p-4">
            <LearningFigure spec={step.figure} className="mx-auto max-w-3xl" />
          </Card>
        )}
        {step.explorer === "ecg" && <EcgExplorer />}
        {step.gallery && <Gallery examples={step.gallery} />}
        {step.playground && <Playground spec={step.playground} />}

        {step.questions.map((q, i) => (
          <QuestionCard key={`${step.id}-${q.id}`} question={q} index={i} />
        ))}
      </article>

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
    </main>
  );
}
