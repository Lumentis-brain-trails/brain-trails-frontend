"use client";

/**
 * A round that is not a Learning choice, on a student's phone: one big button per
 * option (`WireQuestion.buttons`), in the colour the teacher's board gives it (an edge
 * of the braided path). The class's pick is marked once the teacher's screen resolves
 * the round; there is no right or wrong here, only where the class went.
 */
import { useTranslations } from "next-intl";
import { useWords } from "@/components/learning/QuestionCard";
import { Icon, cn } from "@/components/ui";
import { type Phase, type WireQuestion, letter } from "@/lib/classgame/game";

export function LiveButtons({
  round,
  phase,
  answer,
  mine,
  onPick,
}: {
  round: WireQuestion;
  phase: Phase | null;
  answer: string | null;
  mine: string | null;
  onPick: (option: string) => void;
}) {
  const t = useTranslations("classGame");
  const words = useWords();
  const buttons =
    round.buttons ?? round.options.map((id) => ({ id, words: undefined }));
  return (
    <div role="radiogroup" aria-label={t("options")} className="grid gap-3">
      {buttons.map((b, i) => {
        const picked = mine === b.id;
        const chosen = phase === "revealed" && answer === b.id;
        const colour = "colour" in b ? b.colour : undefined;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={picked}
            aria-label={t("option", { letter: letter(i) })}
            disabled={phase !== "open"}
            onClick={() => onPick(b.id)}
            className={cn(
              "pressable flex min-h-16 items-center gap-3 rounded-xl border-2 p-4 text-left disabled:cursor-default",
              picked || chosen ? "border-ink" : "border-hairline"
            )}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold text-white"
              style={{ background: colour ?? "var(--color-ink-3)" }}
              aria-hidden
            >
              {chosen ? <Icon name="check" /> : letter(i)}
            </span>
            {b.words && (
              <span className="text-pretty">{words.text(b.words)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
