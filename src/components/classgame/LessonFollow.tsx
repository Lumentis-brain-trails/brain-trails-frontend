"use client";

/**
 * A student's screen during a teacher-paced lesson: the module's step the teacher is
 * on, with only the questions the teacher has put out. Each question's verdict is
 * reported up (`onVerdict`); the page votes it when it is the question being counted.
 * What the step holds back ("What we found") opens only when the teacher reveals it.
 */
import { ModuleView } from "@/components/learning/ModuleView";
import type { LessonRound, Verdict } from "@/lib/classgame/lesson";
import type { Answer } from "@/lib/learning/questions";
import { moduleOf } from "@/lib/learning/modules";

export function LessonFollow({
  round,
  revealed,
  onVerdict,
}: {
  round: LessonRound;
  /** The teacher has opened what the step held back ("What we found"). */
  revealed: boolean;
  onVerdict: (question: string, verdict: Verdict, answer?: Answer) => void;
}) {
  const mod = moduleOf(round.module);
  if (!mod) return null;
  const control = {
    step: round.step,
    upTo: round.upTo,
    reveal: revealed,
    onVerdict,
  };
  return <ModuleView module={mod} control={control} />;
}
