/**
 * A teacher-paced lesson on the class game's room: the teacher's screen picks the
 * module, the step and how many of the step's questions are out; every student's
 * screen follows (`ModuleView`'s `control`). Each place is one round of the room whose
 * options are the three verdicts a question can end in, so a student's verdict is
 * their vote: the teacher reads how many got it right, wrong, or asked for the answer,
 * never who. A student who retries and gets it right changes their vote to `right`.
 *
 * Pure: the screens are `LessonStage` (teacher) and the `/play` page (students).
 */
import type { LearningModule } from "@/lib/learning/modules";
import type { WireQuestion } from "./game";

export const VERDICTS = ["right", "wrong", "shown"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Where the class is: a module, a step (0-based), questions `0..upTo` out (-1: none). */
export interface LessonPlace {
  module: string;
  step: number;
  upTo: number;
}

/** A lesson round as the room carries it. */
export interface LessonRound extends WireQuestion, LessonPlace {
  kind: "lesson";
  /** The question (or `lab:<stepId>`) whose verdicts this round counts; null: none. */
  counts: string | null;
}

/**
 * The labs that report a goal reached (`NeuronLab`'s `onGoal`, as `lab:<step id>`);
 * a step whose lab has none counts nothing before its first question.
 */
export const LABS_WITH_GOAL = new Set(["gatesLearn"]);

/**
 * What this place counts: the newest question out, or, before any, the step's lab
 * when it has a goal (`lab:<stepId>`, reported once the goal is reached).
 */
export function countedAt(
  module: LearningModule,
  place: LessonPlace
): string | null {
  const step = module.steps[place.step];
  if (!step) return null;
  if (place.upTo >= 0) return step.questions[place.upTo]?.id ?? null;
  return step.lab && LABS_WITH_GOAL.has(step.lab) ? `lab:${step.id}` : null;
}

/** The round for `place`; its id changes with every move, so each move opens a vote. */
export function lessonRound(
  module: LearningModule,
  place: LessonPlace
): LessonRound {
  return {
    id: `lesson:${place.module}:${place.step}:${place.upTo}`,
    kind: "lesson",
    options: [...VERDICTS],
    module: place.module,
    step: place.step,
    upTo: place.upTo,
    counts: countedAt(module, place),
  };
}

/** A round from the room as a lesson place, or null for any other kind of round. */
export function asLesson(round: WireQuestion | null): LessonRound | null {
  if (!round || round.kind !== "lesson") return null;
  if (typeof round.module !== "string") return null;
  if (typeof round.step !== "number" || typeof round.upTo !== "number")
    return null;
  return round as LessonRound;
}

/**
 * Where a step opens: its first question already out, so the class is never shown a
 * step that asks something and hides the question (Andrea, 2026-11-25). A step whose lab
 * reports a goal, or that has no question, opens on its content (`upTo` -1).
 */
export function firstUpTo(module: LearningModule, step: number): number {
  const s = module.steps[step];
  if (!s || s.questions.length === 0) return -1;
  return s.lab && LABS_WITH_GOAL.has(s.lab) ? -1 : 0;
}

/** Where the class starts on `module`: its first step, opened as `firstUpTo` says. */
export function startPlace(module: LearningModule): LessonPlace {
  return { module: module.slug, step: 0, upTo: firstUpTo(module, 0) };
}

/** The next place: the step's next question, else the next step as it opens; null at the end. */
export function nextPlace(
  module: LearningModule,
  place: LessonPlace
): LessonPlace | null {
  const step = module.steps[place.step];
  if (step && place.upTo + 1 < step.questions.length)
    return { ...place, upTo: place.upTo + 1 };
  if (place.step + 1 < module.steps.length)
    return {
      ...place,
      step: place.step + 1,
      upTo: firstUpTo(module, place.step + 1),
    };
  return null;
}

/** The previous place: one question back, else the previous step with all its questions. */
export function previousPlace(
  module: LearningModule,
  place: LessonPlace
): LessonPlace | null {
  if (place.upTo > firstUpTo(module, place.step))
    return { ...place, upTo: place.upTo - 1 };
  if (place.step === 0) return null;
  const before = module.steps[place.step - 1];
  return {
    ...place,
    step: place.step - 1,
    upTo: Math.max(
      before.questions.length - 1,
      firstUpTo(module, place.step - 1)
    ),
  };
}
