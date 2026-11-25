import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/learning/modules";
import { toWire } from "./game";
import {
  asLesson,
  countedAt,
  lessonRound,
  nextPlace,
  previousPlace,
} from "./lesson";

const mod = MODULES.find((m) => m.steps.length > 1)!;

describe("a teacher-paced lesson", () => {
  it("walks every question of a step, then the next step's content", () => {
    let place = { module: mod.slug, step: 0, upTo: -1 };
    const seen: string[] = [];
    for (let i = 0; i < 500; i++) {
      seen.push(`${place.step}:${place.upTo}`);
      const next = nextPlace(mod, place);
      if (!next) break;
      expect(previousPlace(mod, next)).toEqual(place);
      place = next;
    }
    const expected = mod.steps.flatMap((s, i) => [
      `${i}:-1`,
      ...s.questions.map((_, q) => `${i}:${q}`),
    ]);
    expect(seen).toEqual(expected);
    expect(
      previousPlace(mod, { module: mod.slug, step: 0, upTo: -1 })
    ).toBeNull();
  });

  it("counts the newest question out, or the step's lab before any", () => {
    mod.steps.forEach((step, i) => {
      const content = countedAt(mod, { module: mod.slug, step: i, upTo: -1 });
      expect(content).toBe(step.lab ? `lab:${step.id}` : null);
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
});
