"use client";

/**
 * Learning: short interactive lessons for a class, one card per module in the order the
 * course takes them. A module still being written is listed, marked coming soon, so a
 * student sees the whole course from the first day.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, Icon, cn } from "@/components/ui";
import { MODULES } from "@/lib/learning/modules";

export default function LearningPage() {
  const t = useTranslations("learning");
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="type-title">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-ink-2">{t("intro")}</p>
      </header>
      <ol className="grid gap-4 sm:grid-cols-3">
        {MODULES.map((m, i) => {
          const ready = m.steps.length > 0;
          const body = (
            <Card
              className={cn(
                "flex h-full flex-col gap-3",
                ready ? "transition-colors hover:bg-surface-2" : "opacity-60"
              )}
            >
              <span className="type-eyebrow text-ink-3">
                {t("moduleNumber", { n: i + 1 })}
              </span>
              <h2 className="type-heading">{t(`modules.${m.key}.name`)}</h2>
              <p className="flex-1 text-pretty text-ink-2">
                {t(`modules.${m.key}.blurb`)}
              </p>
              <span className="type-caption inline-flex items-center gap-1 text-ink-3">
                {ready ? (
                  <>
                    {t("stepsCount", { n: m.steps.length })}
                    <Icon name="chevron" />
                  </>
                ) : (
                  t("soon")
                )}
              </span>
            </Card>
          );
          return (
            <li key={m.slug}>
              {ready ? (
                <Link href={`/learning/${m.slug}`} className="block h-full">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
