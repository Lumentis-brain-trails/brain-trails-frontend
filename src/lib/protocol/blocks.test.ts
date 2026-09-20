import { describe, expect, test } from "vitest";
import {
  audioConfigSchema,
  baselineConfigSchema,
  questionnaireConfigSchema,
  quizConfigSchema,
  restConfigSchema,
  textConfigSchema,
} from "./blocks";

describe("block config schemas", () => {
  test("defaults fill in what an author may leave out", () => {
    expect(baselineConfigSchema.parse({})).toEqual({
      eyes: "open",
      duration_s: 60,
      end_tone: true,
    });
    expect(restConfigSchema.parse({ mode: "self_paced" })).toEqual({
      mode: "self_paced",
    });
  });

  test("a timed rest needs a duration", () => {
    expect(restConfigSchema.safeParse({}).success).toBe(false);
    expect(restConfigSchema.safeParse({ duration_s: 10 }).success).toBe(true);
  });

  test("media kinds need src or media_id", () => {
    expect(audioConfigSchema.safeParse({}).success).toBe(false);
    expect(audioConfigSchema.safeParse({ src: "a.mp3" }).success).toBe(true);
    expect(
      audioConfigSchema.safeParse({
        media_id: "00000000-0000-0000-0000-000000000001",
      }).success
    ).toBe(true);
    expect(
      audioConfigSchema.safeParse({ media_id: "not-a-uuid" }).success
    ).toBe(false);
    expect(textConfigSchema.safeParse({ min_s: 3 }).success).toBe(false);
    expect(textConfigSchema.safeParse({ body: "Hello" }).success).toBe(true);
  });

  test("questionnaires: fixed instruments need no items, the others do", () => {
    expect(
      questionnaireConfigSchema.safeParse({ instrument: "sam" }).success
    ).toBe(true);
    expect(
      questionnaireConfigSchema.safeParse({ instrument: "nasa_tlx" }).success
    ).toBe(true);
    expect(
      questionnaireConfigSchema.safeParse({ instrument: "vas" }).success
    ).toBe(false);
    expect(
      questionnaireConfigSchema.safeParse({
        instrument: "custom",
        items: [{ id: "q", text: "Pick", type: "choice" }],
      }).success
    ).toBe(false);
    const parsed = questionnaireConfigSchema.parse({
      instrument: "custom",
      items: [{ id: "q", text: "How?" }],
    });
    expect(parsed.items?.[0]).toMatchObject({
      type: "slider",
      min: 0,
      max: 100,
    });
    expect(
      questionnaireConfigSchema.safeParse({
        instrument: "custom",
        items: [{ id: "q", text: "x", min: 5, max: 5 }],
      }).success
    ).toBe(false);
  });

  test("a quiz's correct answer must be one of its choices", () => {
    const scene = { prompt: "2+2?", choices: ["3", "4"] };
    expect(
      quizConfigSchema.safeParse({ scenes: [{ ...scene, correct: 1 }] }).success
    ).toBe(true);
    expect(
      quizConfigSchema.safeParse({ scenes: [{ ...scene, correct: 2 }] }).success
    ).toBe(false);
  });
});
