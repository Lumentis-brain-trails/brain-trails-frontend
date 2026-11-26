"use client";

/**
 * A student's screen during a teacher-paced lesson: the module's step the teacher is
 * on, with only the questions the teacher has put out. Each question's verdict is
 * reported up (`onVerdict`); the page votes it when it is the question being counted.
 */
import { ModuleView } from "@/components/learning/ModuleView";
import type { LessonRound, Verdict } from "@/lib/classgame/lesson";
import { moduleOf } from "@/lib/learning/modules";

export function LessonFollow({
  round,
  onVerdict,
}: {
  round: LessonRound;
  onVerdict: (question: string, verdict: Verdict) => void;
}) {
  const mod = moduleOf(round.module);
  if (!mod) return null;
  return (
    <ModuleView
      module={mod}
      control={{ step: round.step, upTo: round.upTo, onVerdict }}
    />
  );
}
