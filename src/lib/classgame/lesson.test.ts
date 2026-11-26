import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/learning/modules";
import { toWire } from "./game";
import {
  LABS_WITH_GOAL,
  asLesson,
  countedAt,
  firstUpTo,
  lessonRound,
  lessonVote,
  nextPlace,
  previousPlace,
  startPlace,
  verdictCounts,
} from "./lesson";

const mod = MODULES.find((m) => m.steps.length > 1)!;

describe("a teacher-paced lesson", () => {
  it("walks every question of a step, then the next step as it opens", () => {
    let place = startPlace(mod);
    const seen: string[] = [];
    for (let i = 0; i < 500; i++) {
      seen.push(`${place.step}:${place.upTo}`);
      const next = nextPlace(mod, place);
      if (!next) break;
      expect(previousPlace(mod, next)).toEqual(place);
      place = next;
    }
    const expected = mod.steps.flatMap((s, i) => [
      ...(firstUpTo(mod, i) === -1 ? [`${i}:-1`] : []),
      ...s.questions.map((_, q) => `${i}:${q}`),
    ]);
    expect(seen).toEqual(expected);
    expect(previousPlace(mod, startPlace(mod))).toBeNull();
  });

  it("opens a step with its first question out, unless its lab has a goal", () => {
    mod.steps.forEach((step, i) => {
      const goal = !!step.lab && LABS_WITH_GOAL.has(step.lab);
      expect(firstUpTo(mod, i)).toBe(
        step.questions.length === 0 || goal ? -1 : 0
      );
    });
  });

  it("counts the newest question out, or the step's lab before any", () => {
    mod.steps.forEach((step, i) => {
      const content = countedAt(mod, { module: mod.slug, step: i, upTo: -1 });
      expect(content).toBe(
        step.lab && LABS_WITH_GOAL.has(step.lab) ? `lab:${step.id}` : null
      );
      step.questions.forEach((q, j) =>
        expect(countedAt(mod, { module: mod.slug, step: i, upTo: j })).toBe(
          q.id
        )
      );
    });
  });

  it("each place is its own round of the three verdicts", () => {
    const a = lessonRound(mod, { module: mod.slug, step: 0, upTo: -1 });
    const b = lessonRound(mod, { module: mod.slug, step: 0, upTo: 0 });
    expect(a.id).not.toBe(b.id);
    expect(a.options).toEqual(["right", "wrong", "shown"]);
    expect(asLesson(b)).toEqual(b);
    const choice = MODULES.flatMap((m) => m.steps)
      .flatMap((s) => s.questions)
      .find((q) => q.kind === "choice");
    if (choice?.kind === "choice") expect(asLesson(toWire(choice))).toBeNull();
    expect(asLesson(null)).toBeNull();
  });

  it("a choice question is voted by option, and read back as verdicts", () => {
    const step = mod.steps.findIndex((s) =>
      s.questions.some((q) => q.kind === "choice")
    );
    const upTo = mod.steps[step].questions.findIndex(
      (q) => q.kind === "choice"
    );
    const q = mod.steps[step].questions[upTo];
    if (q.kind !== "choice") throw new Error("no choice question");
    const round = lessonRound(mod, { module: mod.slug, step, upTo });
    expect(round.picks).toEqual(q.options.map((o) => o.id));
    expect(round.options).toEqual([...round.picks!, "shown"]);
    const wrong = q.options.find((o) => o.id !== q.answer)!.id;
    expect(lessonVote(round, "wrong", { kind: "choice", id: wrong })).toBe(
      wrong
    );
    expect(lessonVote(round, "shown", { kind: "choice", id: q.answer })).toBe(
      "shown"
    );
    expect(
      verdictCounts(round, { [q.answer]: 2, [wrong]: 3, shown: 1 }, q.answer)
    ).toEqual({ right: 2, wrong: 3, shown: 1 });
    const plain = { picks: null };
    expect(lessonVote({ ...round, ...plain }, "right")).toBe("right");
    expect(verdictCounts(plain, { right: 1 })).toEqual({
      right: 1,
      wrong: 0,
      shown: 0,
    });
  });
});
