"use client";

/**
 * A live question as both screens draw it: the prompt, its figures, and the options
 * with a letter each. On the teacher's projector every option carries a bar of its
 * votes; on a student's phone the options are big buttons. Once the answer is revealed
 * the right option is marked on both, and the count is shown to everyone.
 */
import { useTranslations } from "next-intl";
import { Icon, cn } from "@/components/ui";
import { LearningFigure } from "@/components/learning/LearningFigure";
import { useWords } from "@/components/learning/QuestionCard";
import {
  type Phase,
  type ShownChoice,
  type Tally,
  leaders,
  letter,
  shares,
} from "@/lib/classgame/game";

export function LiveChoice({
  question,
  phase,
  answer,
  tally,
  showCount,
  mine,
  onPick,
  big = false,
}: {
  question: ShownChoice;
  phase: Phase | null;
  answer: string | null;
  tally: Tally | null;
  /** Draw the bars (the host's choice before reveal; always after). */
  showCount: boolean;
  /** The student's vote. */
  mine?: string | null;
  /** Given on a student's phone while voting is open. */
  onPick?: (option: string) => void;
  /** The projector: larger type. */
  big?: boolean;
}) {
  const t = useTranslations("classGame");
  const words = useWords();
  const ids = question.options.map((o) => o.id);
  const pct = shares(tally, ids);
  const top = leaders(tally, ids);
  const revealed = phase === "revealed";
  const pictures = question.options.some((o) => o.figure);

  return (
    <div className="space-y-5">
      <p className={cn("text-pretty", big ? "type-title" : "type-subhead")}>
        {words.rich(question.prompt)}
      </p>

      {question.figures && question.figures.length > 0 && (
        <div
          className={cn(
            "grid gap-3",
            question.figures.length > 1 && "sm:grid-cols-2"
          )}
        >
          {question.figures.map((f, i) => (
            <div key={i} className="rounded-xl border border-hairline p-2">
              <LearningFigure spec={f} />
            </div>
          ))}
        </div>
      )}

      <div
        role={onPick ? "radiogroup" : "list"}
        aria-label={t("options")}
        className={cn(
          "grid gap-3",
          pictures
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1",
          big && !pictures && "md:grid-cols-2"
        )}
      >
        {question.options.map((o, i) => {
          const right = revealed && answer === o.id;
          const picked = mine === o.id;
          const body = (
            <>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold",
                    right
                      ? "bg-ok text-on-accent"
                      : picked
                        ? "bg-accent text-on-accent"
                        : "bg-surface-2 text-ink-2"
                  )}
                  aria-hidden
                >
                  {right ? <Icon name="check" /> : letter(i)}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  {o.figure && <LearningFigure spec={o.figure} />}
                  {o.words && (
                    <span
                      className={cn("block text-pretty", big && "text-[20px]")}
                    >
                      {words.text(o.words)}
                    </span>
                  )}
                </div>
              </div>
              {(showCount || revealed) && tally && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        right
                          ? "bg-ok"
                          : top.includes(o.id)
                            ? "bg-accent"
                            : "bg-ink-3"
                      )}
                      style={{ width: `${pct[i]}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-2">
                    {t("votes", { n: tally.counts[o.id] ?? 0 })}
                  </span>
                </div>
              )}
            </>
          );
          const frame = cn(
            "rounded-xl border p-4 text-left transition-colors",
            right
              ? "border-ok bg-ok-soft"
              : picked
                ? "border-accent bg-accent-soft"
                : "border-hairline"
          );
          return onPick ? (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={picked}
              aria-label={t("option", { letter: letter(i) })}
              disabled={phase !== "open"}
              onClick={() => onPick(o.id)}
              className={cn(
                frame,
                "pressable min-h-16 disabled:cursor-default",
                !picked && !right && "hover:bg-surface-2"
              )}
            >
              {body}
            </button>
          ) : (
            <div key={o.id} role="listitem" className={frame}>
              {body}
            </div>
          );
        })}
      </div>

      {revealed && question.explain && (
        <div className="rounded-xl bg-surface-2 p-4 text-ink-2">
          {words.rich(question.explain)}
        </div>
      )}
    </div>
  );
}
