/**
 * The class game (backend `docs/api/class-game.md`, flag `class_games`): a teacher puts
 * one Learning question on the projector, the class votes from their phones, the count
 * is shared.
 *
 * Questions are the Learning modules' own (`src/lib/learning/`): any multiple-choice
 * `Question` can be played live. What goes over the wire is the question **without its
 * answer** - the server only needs the option ids to count - and the teacher's screen
 * keeps the answer to send at reveal. Everything here is pure: the socket and the hooks
 * are in `useClassGame.ts`, the screens in `src/components/classgame/`.
 */
import type { LearningModule } from "@/lib/learning/modules";
import type { Question } from "@/lib/learning/questions";

/** A question that can be played live: one of its options is the answer. */
export type ChoiceQuestion = Extract<Question, { kind: "choice" }>;

/** What a student's screen receives: the question with no answer in it. */
export type ShownChoice = Omit<ChoiceQuestion, "answer">;

/** A question as the game socket carries it: `id` and `options` are what it counts. */
export interface WireQuestion {
  id: string;
  options: string[];
  choice: ShownChoice;
}

/** The server's limits on a question (`app/classgame.py`). */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

/** Whether a Learning question can be played live: a choice of 2 to 8 options. */
export function isLiveQuestion(question: Question): question is ChoiceQuestion {
  return (
    question.kind === "choice" &&
    question.options.length >= MIN_OPTIONS &&
    question.options.length <= MAX_OPTIONS
  );
}

/**
 * The frame body for `question`: its answer left out, so a student's browser cannot
 * read it before the teacher reveals it.
 */
export function toWire(question: ChoiceQuestion): WireQuestion {
  const { answer: _answer, ...shown } = question;
  void _answer;
  return {
    id: question.id,
    options: question.options.map((o) => o.id),
    choice: shown,
  };
}

/** One playable question, with where it comes from (for the teacher's list). */
export interface LiveEntry {
  module: LearningModule;
  /** 0-based step in the module. */
  step: number;
  question: ChoiceQuestion;
}

/** Every question the modules hold that can be played live, in course order. */
export function liveQuestions(modules: LearningModule[]): LiveEntry[] {
  const out: LiveEntry[] = [];
  for (const mod of modules)
    mod.steps.forEach((step, i) => {
      for (const question of step.questions)
        if (isLiveQuestion(question))
          out.push({ module: mod, step: i, question });
    });
  return out;
}

/** A letter for option `i`: what the teacher reads out ("most of you said B"). */
export function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

export type Phase = "open" | "closed" | "revealed";

export interface Tally {
  question: string | null;
  counts: Record<string, number>;
  votes: number;
}

/** The game as one screen sees it. */
export interface GameView {
  role: "host" | "player" | null;
  schoolName: string | null;
  question: WireQuestion | null;
  phase: Phase | null;
  /** The right option once revealed; null before, and for a question with none. */
  answer: string | null;
  /** The host's live count; a player's once revealed. */
  tally: Tally | null;
  /** Students' screens connected now (the host's). */
  players: number;
  /** This student's vote on the current question. */
  mine: string | null;
  /** The teacher ended the game. */
  ended: boolean;
  /** The last refusal from the server (`voting_closed`, `invalid_option`, ...). */
  error: string | null;
}

export const emptyGame: GameView = {
  role: null,
  schoolName: null,
  question: null,
  phase: null,
  answer: null,
  tally: null,
  players: 0,
  mine: null,
  ended: false,
  error: null,
};

type Frame = { type?: unknown } & Record<string, unknown>;

function asTally(raw: unknown): Tally | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (!t.counts || typeof t.counts !== "object") return null;
  return {
    question: typeof t.question === "string" ? t.question : null,
    counts: t.counts as Record<string, number>,
    votes: typeof t.votes === "number" ? t.votes : 0,
  };
}

function asQuestion(raw: unknown): WireQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Partial<WireQuestion>;
  if (typeof q.id !== "string" || !Array.isArray(q.options) || !q.choice)
    return null;
  return q as WireQuestion;
}

function asPhase(raw: unknown): Phase | null {
  return raw === "open" || raw === "closed" || raw === "revealed" ? raw : null;
}

/**
 * The view after one frame from the game socket. A count for another question than the
 * current one (a vote that crossed the next question) is ignored; a new question clears
 * the answer, the count and the student's vote.
 */
export function applyGameFrame(view: GameView, frame: Frame): GameView {
  switch (frame.type) {
    case "hello": {
      const presence = frame.presence as { players?: number } | undefined;
      return {
        ...emptyGame,
        role: frame.role === "host" ? "host" : "player",
        schoolName:
          typeof frame.school_name === "string" ? frame.school_name : null,
        question: asQuestion(frame.question),
        phase: asPhase(frame.phase),
        answer: typeof frame.answer === "string" ? frame.answer : null,
        tally: asTally(frame.tally),
        players: presence?.players ?? 0,
        mine: typeof frame.mine === "string" ? frame.mine : null,
      };
    }
    case "question": {
      const question = asQuestion(frame.question);
      if (!question) return view;
      return {
        ...view,
        question,
        phase: "open",
        answer: null,
        tally:
          view.role === "host"
            ? {
                question: question.id,
                counts: Object.fromEntries(question.options.map((o) => [o, 0])),
                votes: 0,
              }
            : null,
        mine: null,
        error: null,
      };
    }
    case "phase":
      return { ...view, phase: asPhase(frame.phase) ?? view.phase };
    case "reveal":
      return {
        ...view,
        phase: "revealed",
        answer: typeof frame.answer === "string" ? frame.answer : null,
        tally: asTally(frame.tally) ?? view.tally,
      };
    case "tally": {
      const tally = asTally(frame);
      if (!tally || (view.question && tally.question !== view.question.id))
        return view;
      return { ...view, tally };
    }
    case "presence":
      return {
        ...view,
        players: typeof frame.players === "number" ? frame.players : 0,
      };
    case "voted":
      if (view.question && frame.question !== view.question.id) return view;
      return {
        ...view,
        mine: typeof frame.option === "string" ? frame.option : view.mine,
        error: null,
      };
    case "error":
      return {
        ...view,
        error: typeof frame.code === "string" ? frame.code : "",
      };
    case "end":
      return { ...view, ended: true };
    default:
      return view;
  }
}

/** Each option's share of the votes, 0 to 100, rounded; all 0 with no votes. */
export function shares(tally: Tally | null, options: string[]): number[] {
  const total = tally?.votes ?? 0;
  return options.map((o) =>
    total > 0 ? Math.round(((tally?.counts[o] ?? 0) / total) * 100) : 0
  );
}

/** The options with the most votes (several on a tie, none with no votes). */
export function leaders(tally: Tally | null, options: string[]): string[] {
  if (!tally || tally.votes === 0) return [];
  const top = Math.max(...options.map((o) => tally.counts[o] ?? 0));
  return options.filter((o) => (tally.counts[o] ?? 0) === top);
}
