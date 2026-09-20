import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import "@/components/protocol/kinds";
import { bindMedia, mediaIds } from "./media";
import { resolvePlan } from "./resolve";
import { parseProtocol } from "./schema";
import { parseTree } from "./tree";
import { mulberry32 } from "./rng";
import { generateGoNoGo, sequenceDurationMs } from "./trials";
import { SIGNAL_NAVIGATOR } from "./__fixtures__/signalNavigator";

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
  test("the five official templates are present", () => {
    expect(FILES).toEqual([
      "emotion-video.json",
      "free-recording.json",
      "resting-baseline.json",
      "signal-navigator.json",
      "sustained-focus.json",
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

  /**
   * The task itself must not drift from the code definition it replaced: the go/no-go
   * and breathing blocks keep their numbers exactly. The framing around them did change
   * on purpose (2026-09-19): the arrival screen no longer holds the participant for 30
   * seconds behind a disabled button - that settling time is now a real eyes-open
   * baseline block, which is both visible and analysable.
   */
  test("signal navigator keeps the task blocks of the code definition", () => {
    const protocol = run("signal-navigator.json");
    const reference = parseProtocol(SIGNAL_NAVIGATOR);
    expect(protocol.contentWarning).toBe(reference.contentWarning);
    expect(protocol.steps.map((s) => s.id)).toEqual([
      "arrival",
      "settle",
      "challenge_a",
      "reset",
      "challenge_b",
      "outro",
    ]);
    for (const ref of reference.steps) {
      if (ref.kind === "prompt") continue;
      const step = protocol.steps.find((s) => s.id === ref.id);
      expect(step, ref.id).toBeTruthy();
      expect(step!.kind).toBe(ref.kind);
      expect(step!.label).toBe(ref.label);
      expect(step!.config).toEqual(ref.config);
      expect(step!.block?.condition).toBe(ref.phase);
    }
    const settle = protocol.steps.find((s) => s.id === "settle")!;
    expect(settle.kind).toBe("baseline");
    expect(settle.config).toMatchObject({ eyes: "open", duration_s: 30 });
    const arrival = protocol.steps.find((s) => s.id === "arrival")!;
    expect((arrival.config as { advance: { mode: string } }).advance.mode).toBe(
      "key"
    );
  });

  /**
   * Sustained Focus is the measurement-first sibling of Signal Navigator, which stays
   * pinned to its spec above. Each number below is there for a reason an analysis
   * depends on, so each is asserted rather than left to the JSON:
   * - an eyes-closed baseline, or no block has a `baseline_distance` (backend S20);
   * - practice trials flagged as such, so learning the keys is not scored as lapses;
   * - one long block with rare no-go trials: pressing becomes the habit (85% go), which
   *   is what makes withholding costly, and six minutes is long enough for a vigilance
   *   decrement to show; never two no-go trials in a row;
   * - at least 30 no-go trials, the floor for a frontal no-go ERP once blinks are
   *   rejected;
   * - the same SAM before and after, so a change in arousal has two ends.
   */
  test("sustained focus: baselines, flagged practice, one long block with rare no-go", () => {
    for (let seed = 0; seed < 25; seed++) {
      const steps = run("sustained-focus.json", seed).steps;
      expect(steps.map((s) => s.id)).toEqual([
        "welcome",
        "eyes_closed",
        "eyes_open",
        "mood_before",
        "rule",
        "practice",
        "ready",
        "focus",
        "mood_after",
        "outro",
      ]);
    }
    const steps = run("sustained-focus.json").steps;
    const config = (id: string) =>
      steps.find((s) => s.id === id)!.config as Record<string, unknown>;
    expect(config("eyes_closed")).toMatchObject({
      eyes: "closed",
      duration_s: 60,
    });
    expect(config("practice")).toMatchObject({ practice: true });
    expect(config("focus").practice).toBeUndefined();
    expect(config("mood_before").instrument).toBe("sam");
    expect(config("mood_after").instrument).toBe("sam");

    const focus = config("focus") as {
      n: number;
      goRatio: number;
      maxRun: number;
      maxNogoRun: number;
      travelMs: [number, number];
      itiMs: [number, number];
    };
    for (let seed = 0; seed < 25; seed++) {
      const trials = generateGoNoGo(focus, mulberry32(seed));
      const nogo = trials.filter((t) => t.trialType === "nogo");
      expect(trials).toHaveLength(240);
      expect(nogo.length).toBeGreaterThanOrEqual(30);
      expect(nogo.length / trials.length).toBeLessThan(0.2);
      trials.forEach((t, i) => {
        if (i > 0 && t.trialType === "nogo")
          expect(trials[i - 1].trialType).toBe("go");
      });
      const minutes = sequenceDurationMs(trials) / 60_000;
      expect(minutes).toBeGreaterThan(5);
      expect(minutes).toBeLessThan(7);
    }
  });
});
