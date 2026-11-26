"use client";

/**
 * A student's screen during a teacher-paced lesson: the module's step the teacher is
 * on, with only the questions the teacher has put out. Each question's verdict is
 * reported up (`onVerdict`); the page votes it when it is the question being counted.
 * Whether an answer was right, and what the step holds back ("What we found"), show
 * only once the teacher reveals them.
 */
import { ModuleView } from "@/components/learning/ModuleView";
import {
  type LessonRound,
  type Verdict,
  revealedUpTo,
  stepRevealed,
} from "@/lib/classgame/lesson";
import type { Answer } from "@/lib/learning/questions";
import { moduleOf } from "@/lib/learning/modules";

export function LessonFollow({
  round,
  phase,
  onVerdict,
}: {
  round: LessonRound;
  /** The room's phase: `revealed` once the teacher shows this round's answer. */
  phase: string | null;
  onVerdict: (question: string, verdict: Verdict, answer?: Answer) => void;
}) {
  const mod = moduleOf(round.module);
  if (!mod) return null;
  const control = {
    step: round.step,
    upTo: round.upTo,
    revealedUpTo: revealedUpTo(round, phase),
    reveal: stepRevealed(mod, round, phase),
    onVerdict,
  };
  return <ModuleView module={mod} control={control} />;
}
