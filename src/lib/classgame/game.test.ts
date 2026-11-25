import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/learning/modules";
import type { Question } from "@/lib/learning/questions";
import {
  type ChoiceQuestion,
  type GameView,
  applyGameFrame,
  emptyGame,
  isLiveQuestion,
  leaders,
  letter,
  liveQuestions,
  shares,
  toWire,
} from "./game";

const QUESTION: ChoiceQuestion = {
  kind: "choice",
  id: "q1",
  prompt: { key: "encoding.q1" },
  options: [
    { id: "a", words: { key: "encoding.a" } },
    { id: "b", words: { key: "encoding.b" } },
    { id: "c", words: { key: "encoding.c" } },
  ],
  answer: "b",
  explain: { key: "encoding.why" },
};

const reduce = (view: GameView, ...frames: Record<string, unknown>[]) =>
  frames.reduce(applyGameFrame, view);

describe("which questions play live", () => {
  it("takes choices of 2 to 8 options only", () => {
    expect(isLiveQuestion(QUESTION)).toBe(true);
    expect(
      isLiveQuestion({ ...QUESTION, options: QUESTION.options.slice(0, 1) })
    ).toBe(false);
    const count: Question = {
      kind: "count",
      id: "n",
      prompt: { key: "x" },
      answer: 3,
      explain: { key: "y" },
    };
    expect(isLiveQuestion(count)).toBe(false);
  });

  it("finds the modules' choices in course order, with their step", () => {
    const entries = liveQuestions(MODULES);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.question.kind).toBe("choice");
      expect(e.module.steps[e.step].questions).toContain(e.question);
    }
    const ids = entries.map((e) => e.question.id);
    expect(new Set(ids).size).toBe(ids.length); // ids name a question in the room
  });
});

describe("the wire", () => {
  it("never carries the answer", () => {
    const wire = toWire(QUESTION);
    expect(wire.id).toBe("q1");
    expect(wire.options).toEqual(["a", "b", "c"]);
    expect("answer" in wire.choice).toBe(false);
    expect(JSON.stringify(wire)).not.toContain('"answer"');
  });

  it("letters the options", () => {
    expect([0, 1, 7].map(letter)).toEqual(["A", "B", "H"]);
  });
});

describe("a game as a screen sees it", () => {
  const wire = toWire(QUESTION);

  it("a host follows the question, the count, the reveal and the end", () => {
    let view = reduce(emptyGame, {
      type: "hello",
      role: "host",
      school_name: "Liceo",
      presence: { players: 3 },
      question: null,
    });
    expect(view.role).toBe("host");
    expect(view.players).toBe(3);
    view = reduce(view, { type: "question", question: wire, phase: "open" });
    expect(view.tally).toEqual({
      question: "q1",
      counts: { a: 0, b: 0, c: 0 },
      votes: 0,
    });
    view = reduce(
      view,
      { type: "tally", question: "q1", counts: { a: 1, b: 2, c: 0 }, votes: 3 },
      { type: "tally", question: "old", counts: { a: 9 }, votes: 9 } // crossed
    );
    expect(view.tally?.votes).toBe(3);
    view = reduce(view, { type: "phase", phase: "closed" });
    expect(view.phase).toBe("closed");
    view = reduce(view, {
      type: "reveal",
      answer: "b",
      tally: { question: "q1", counts: { a: 1, b: 2, c: 0 }, votes: 3 },
    });
    expect(view.phase).toBe("revealed");
    expect(view.answer).toBe("b");
    expect(reduce(view, { type: "end" }).ended).toBe(true);
  });

  it("a player keeps their vote until the next question", () => {
    let view = reduce(
      emptyGame,
      {
        type: "hello",
        role: "player",
        question: wire,
        phase: "open",
        mine: "a",
      },
      { type: "voted", question: "q1", option: "c" }
    );
    expect(view.mine).toBe("c");
    expect(view.tally).toBeNull(); // no count before the reveal
    view = reduce(view, { type: "error", code: "voting_closed" });
    expect(view.error).toBe("voting_closed");
    view = reduce(view, {
      type: "question",
      question: { ...wire, id: "q2" },
    });
    expect(view.mine).toBeNull();
    expect(view.answer).toBeNull();
    expect(view.error).toBeNull();
    expect(
      reduce(view, { type: "voted", question: "q1", option: "a" }).mine
    ).toBeNull();
  });

  it("ignores frames it cannot read", () => {
    const view = reduce(emptyGame, { type: "question", question: { id: 1 } });
    expect(view).toEqual(emptyGame);
    expect(reduce(emptyGame, { type: "mystery" })).toBe(emptyGame);
  });
});

describe("the count", () => {
  const tally = { question: "q1", counts: { a: 1, b: 2, c: 1 }, votes: 4 };

  it("shares round to whole percents, zeros with no votes", () => {
    expect(shares(tally, ["a", "b", "c"])).toEqual([25, 50, 25]);
    expect(shares(null, ["a", "b"])).toEqual([0, 0]);
  });

  it("leaders are every option at the top, none with no votes", () => {
    expect(leaders(tally, ["a", "b", "c"])).toEqual(["b"]);
    expect(
      leaders({ ...tally, counts: { a: 2, b: 2, c: 0 } }, ["a", "b", "c"])
    ).toEqual(["a", "b"]);
    expect(leaders({ ...tally, votes: 0 }, ["a"])).toEqual([]);
  });
});
