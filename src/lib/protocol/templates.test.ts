import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import "@/components/protocol/kinds";
import { bindMedia, mediaIds } from "./media";
import { resolvePlan } from "./resolve";
import { parseProtocol } from "./schema";
import { parseTree } from "./tree";
import { SIGNAL_NAVIGATOR } from "./definitions/signalNavigator";

/**
 * The official templates the backend seeds (`schemas/templates/*.json`). Each must
 * resolve, bind and then validate block by block against its kind, exactly the path a
 * real session takes, so a template can never ship that fails in front of a participant.
 */
const DIR = path.resolve(process.cwd(), "schemas/templates");
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

function load(file: string): unknown {
  return JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
}

function run(file: string, seed = 1) {
  const plan = resolvePlan(load(file), seed, {
    id: file,
    version: 1,
    title: file,
  });
  const media = Object.fromEntries(
    mediaIds(plan).map((id) => [
      id,
      { url: `https://example.test/${id}`, kind: "video" },
    ])
  );
  return parseProtocol(bindMedia(plan, media));
}

describe("templates", () => {
  test("the four official templates are present", () => {
    expect(FILES).toEqual([
      "emotion-video.json",
      "free-recording.json",
      "resting-baseline.json",
      "signal-navigator.json",
    ]);
  });

  test.each(FILES)(
    "%s resolves and every step validates against its kind",
    (file) => {
      parseTree(load(file));
      const protocol = run(file);
      expect(protocol.steps.length).toBeGreaterThan(0);
    }
  );

  test("resting baseline: instructions, eyes open 60 s, eyes closed 60 s", () => {
    const steps = run("resting-baseline.json").steps;
    expect(
      steps.map((s) => [s.kind, (s.config as { eyes?: string }).eyes])
    ).toEqual([
      ["instructions", undefined],
      ["baseline", "open"],
      ["baseline", "closed"],
    ]);
  });

  test("free recording is one self-paced rest", () => {
    const steps = run("free-recording.json").steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      kind: "rest",
      label: "Free recording",
      config: { mode: "self_paced" },
    });
  });

  test("emotion video: both clips once, each followed by rest and SAM, seed-ordered", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const steps = run("emotion-video.json", seed).steps;
      expect(steps.map((s) => s.kind)).toEqual([
        "baseline",
        "video",
        "rest",
        "questionnaire",
        "video",
        "rest",
        "questionnaire",
        "baseline",
      ]);
      const clips = steps
        .filter((s) => s.kind === "video")
        .map((s) => (s.config as { media_id: string }).media_id);
      expect([...clips].sort()).toEqual([
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
      ]);
      expect((steps[1].config as { src: string }).src).toContain(clips[0]);
      orders.add(clips.join());
    }
    expect(orders.size).toBe(2);
  });

  test("signal navigator keeps the code definition's steps and configs", () => {
    const protocol = run("signal-navigator.json");
    const reference = parseProtocol(SIGNAL_NAVIGATOR);
    expect(protocol.contentWarning).toBe(reference.contentWarning);
    expect(protocol.steps.map((s) => s.id)).toEqual(
      reference.steps.map((s) => s.id)
    );
    protocol.steps.forEach((step, i) => {
      const ref = reference.steps[i];
      expect(step.kind).toBe(ref.kind === "prompt" ? "instructions" : ref.kind);
      expect(step.label).toBe(ref.label);
      expect(step.config).toEqual(ref.config);
      expect(step.block?.condition).toBe(ref.phase);
    });
  });
});
