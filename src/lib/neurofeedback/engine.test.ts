import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  type NeurofeedbackConfig,
  neurofeedbackConfigSchema,
} from "@/lib/protocol/blocks";
import { EEG_CHANNELS } from "@/lib/muse/protocol";
import {
  HOP_SAMPLES,
  NUDGE_FACTOR,
  NeurofeedbackEngine,
  type NfOutput,
  type NfUpdate,
  SFREQ,
  nfChannels,
  nfDirection,
  quantile,
  windowValue,
} from "./engine";
import { MAX_LUMINANCE_RATE } from "./picture";
import { makeRecording, packetsOf } from "./recording.fixture";

const MEDIA = "00000000-0000-0000-0000-000000000001";

function config(extra: Record<string, unknown> = {}): NeurofeedbackConfig {
  return neurofeedbackConfigSchema.parse({
    media_id: MEDIA,
    baseline_s: 10,
    duration_s: 30,
    ...extra,
  });
}

/**
 * The fixed recording every engine test reads: 42 s, alpha up at the back during
 * 16-22 s and 30-34 s, blinks at 12.5 s and 25.2 s, a jaw clench at 27-28.5 s.
 */
const RECORDING = makeRecording({
  seconds: 42,
  alphaOn: [
    [16, 22],
    [30, 34],
  ],
  blinks: [12.5, 25.2],
  jaw: [[27, 28.5]],
});

function run(c: NeurofeedbackConfig, packets = packetsOf(RECORDING)) {
  const engine = new NeurofeedbackEngine(c);
  const outputs = packets.flatMap((p) => engine.push(p));
  const updates = outputs
    .filter(
      (o): o is Extract<NfOutput, { type: "update" }> => o.type === "update"
    )
    .map((o) => o.update);
  return { engine, outputs, updates };
}

const at = (u: NfUpdate) => (u.sampleEnd - RECORDING.firstIndex) / SFREQ;
const count = (updates: NfUpdate[], f: (u: NfUpdate) => boolean) =>
  updates.filter(f).length;

describe("defaults from the signal", () => {
  test("direction and electrodes follow the signal unless the author chose", () => {
    expect(nfDirection(config())).toBe("up");
    expect(nfDirection(config({ signal: "theta_beta" }))).toBe("down");
    expect(nfDirection(config({ signal: "theta", direction: "up" }))).toBe(
      "up"
    );
    expect(nfChannels(config())).toEqual(["TP9", "TP10"]);
    expect(nfChannels(config({ signal: "smr" }))).toEqual(["AF7", "AF8"]);
    expect(nfChannels(config({ channels: ["AF8"] }))).toEqual(["AF8"]);
  });

  test("no baseline needs a fixed threshold", () => {
    expect(
      neurofeedbackConfigSchema.safeParse({ media_id: MEDIA, baseline_s: 0 })
        .success
    ).toBe(false);
    expect(
      neurofeedbackConfigSchema.safeParse({
        media_id: MEDIA,
        baseline_s: 0,
        threshold: { mode: "fixed", value: 0.2 },
      }).success
    ).toBe(true);
    expect(
      neurofeedbackConfigSchema.safeParse({ media_id: MEDIA, baseline_s: 181 })
        .success
    ).toBe(false);
  });
});

describe("the fixed recording, alpha up at TP9/TP10", () => {
  const { outputs, updates } = run(config());

  test("one update every 24 samples, baseline then training, then done", () => {
    expect(updates).toHaveLength(107 + 320);
    for (let i = 1; i < updates.length; i++)
      expect(updates[i].sampleEnd - updates[i - 1].sampleEnd).toBe(HOP_SAMPLES);
    expect(updates[0].sampleEnd % HOP_SAMPLES).toBe(0);
    expect(at(updates[0])).toBeGreaterThanOrEqual(1);
    expect(count(updates, (u) => u.phase === "baseline")).toBe(107);
    expect(outputs.at(-1)).toEqual({ type: "done", reason: "duration" });
  });

  test("the baseline holds the picture still and sets the threshold from itself", () => {
    const baseline = updates.filter((u) => u.phase === "baseline");
    expect(new Set(baseline.map((u) => u.brightness.toFixed(9))).size).toBe(1);
    expect(baseline.every((u) => u.inTarget === null)).toBe(true);
    const set = outputs.find((o) => o.type === "threshold");
    expect(set).toMatchObject({ cause: "baseline", previous: null });
    const smoothed = baseline.map((u) => u.smoothed!);
    // up, target_fraction 0.4: 40% of the baseline above the threshold
    expect(set && "threshold" in set && set.threshold).toBeCloseTo(
      quantile(smoothed, 0.6),
      12
    );
    expect(set && "threshold" in set && set.threshold).toBeCloseTo(0.091069, 6);
  });

  test("the alpha bursts are rewarded and the picture brightens", () => {
    const burst = updates.filter((u) => at(u) >= 18 && at(u) < 22);
    expect(burst.every((u) => u.inTarget === true)).toBe(true);
    expect(burst.at(-1)!.brightness).toBeCloseTo(1, 6);
    expect(count(updates, (u) => u.inTarget === true)).toBe(221);
    expect(count(updates, (u) => u.inTarget === false)).toBe(81);
  });

  test("blinks do not reach the posterior electrodes; the jaw is gated", () => {
    const gated = updates.filter((u) => u.gated !== null);
    expect(new Set(gated.map((u) => u.gated))).toEqual(new Set(["muscle"]));
    expect(gated).toHaveLength(18);
    expect(gated.every((u) => at(u) > 27 && at(u) < 29.6)).toBe(true);
  });

  test("a gated update changes nothing", () => {
    for (let i = 1; i < updates.length; i++) {
      if (updates[i].gated === null) continue;
      expect(updates[i].value).toBeNull();
      expect(updates[i].inTarget).toBeNull();
      expect(updates[i].smoothed).toBe(updates[i - 1].smoothed);
      expect(updates[i].level).toBe(updates[i - 1].level);
      expect(updates[i].brightness).toBe(updates[i - 1].brightness);
    }
  });

  test("the luminance never changes faster than the photosensitivity limit", () => {
    const dt = HOP_SAMPLES / SFREQ;
    for (let i = 1; i < updates.length; i++) {
      const step =
        Math.abs(
          updates[i].brightness ** 2.2 - updates[i - 1].brightness ** 2.2
        ) / dt;
      expect(step).toBeLessThanOrEqual(MAX_LUMINANCE_RATE + 1e-9);
    }
  });

  test("each update names the arrival of the packets it is the first to include", () => {
    // packets arrive 8 ms after their last sample; the update includes two of them
    for (const u of updates.slice(1)) {
      const lastSampleMs =
        5000 + ((u.sampleEnd - RECORDING.firstIndex) / SFREQ) * 1000;
      expect(u.firstArrivalMs).toBeCloseTo(
        lastSampleMs - (12 / SFREQ) * 1000 + 8,
        6
      );
    }
  });
});

describe("theta down at AF7/AF8, on the same recording", () => {
  const { updates } = run(config({ signal: "theta" }));

  test("blinks are gated by amplitude, the jaw by muscle", () => {
    const blinks = updates.filter((u) => u.gated === "amplitude");
    expect(blinks).toHaveLength(24);
    expect(
      blinks.every(
        (u) => (at(u) > 12.3 && at(u) < 13.8) || (at(u) > 25 && at(u) < 26.5)
      )
    ).toBe(true);
    expect(count(updates, (u) => u.gated === "muscle")).toBe(17);
  });

  test("in target means below the threshold", () => {
    for (const u of updates)
      if (u.inTarget !== null)
        expect(u.inTarget).toBe(u.smoothed! < u.threshold!);
  });
});

describe("thresholds", () => {
  test("a fixed threshold is announced first and holds through the baseline", () => {
    const { outputs, updates } = run(
      config({ threshold: { mode: "fixed", value: 0.3 } })
    );
    expect(outputs[0]).toEqual({
      type: "threshold",
      threshold: 0.3,
      previous: null,
      cause: "fixed",
    });
    expect(outputs.filter((o) => o.type === "threshold")).toHaveLength(1);
    expect(updates.every((u) => u.threshold === 0.3)).toBe(true);
  });

  test("without a baseline the training starts with the first update", () => {
    const { updates } = run(
      config({ baseline_s: 0, threshold: { mode: "fixed", value: 0.3 } })
    );
    expect(updates[0].phase).toBe("training");
    expect(updates).toHaveLength(320);
  });

  test("nudges move the threshold by 5% a step, at most five", () => {
    const engine = new NeurofeedbackEngine(config());
    expect(engine.nudge(1)).toBeNull(); // no threshold before the baseline ends
    const packets = packetsOf(RECORDING);
    let i = 0;
    while (engine.currentThreshold === null) engine.push(packets[i++]);
    const start = engine.currentThreshold;
    expect(engine.nudge(2)).toEqual({
      previous: start,
      threshold: start * NUDGE_FACTOR ** 2,
    });
    expect(engine.nudge(-9)!.threshold).toBeCloseTo(
      start * NUDGE_FACTOR ** -3,
      12
    );
    expect(engine.nudge(0)).toBeNull();
    // the next update compares with the nudged threshold
    const next = packets
      .slice(i)
      .flatMap((p) => engine.push(p))
      .find((o) => o.type === "update");
    expect(next && "update" in next && next.update.threshold).toBeCloseTo(
      start * NUDGE_FACTOR ** -3,
      12
    );
  });

  test("an unusable baseline is extended once, then the block gives up", () => {
    const clenched = makeRecording({ seconds: 42, jaw: [[0, 42]] });
    const { outputs, engine } = run(config(), packetsOf(clenched));
    const kinds = outputs.filter((o) => o.type !== "update").map((o) => o.type);
    expect(kinds).toEqual(["baseline_extended", "baseline_failed", "done"]);
    expect(engine.done).toBe(true);
    expect(outputs.at(-1)).toEqual({ type: "done", reason: "baseline_failed" });
  });

  test("a fixed threshold survives an unusable baseline", () => {
    const clenched = makeRecording({ seconds: 42, jaw: [[0, 12]] });
    const { outputs } = run(
      config({ threshold: { mode: "fixed", value: 0.3 } }),
      packetsOf(clenched)
    );
    expect(outputs.some((o) => o.type === "baseline_failed")).toBe(false);
  });
});

describe("lost packets", () => {
  test("no window spans a hole: those updates are gated as gaps", () => {
    const { updates } = run(config(), packetsOf(RECORDING, [20, 21]));
    const gaps = updates.filter((u) => u.gated === "gap");
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((u) => at(u) > 20 && at(u) <= 22)).toBe(true);
  });

  test("a duplicate packet adds nothing", () => {
    const packets = packetsOf(RECORDING);
    const doubled = packets.flatMap((p, i) => (i % 9 === 0 ? [p, p] : [p]));
    expect(run(config(), doubled).updates).toEqual(run(config()).updates);
  });

  test("packets of electrodes the block does not read are ignored", () => {
    const { updates } = run(
      config(),
      packetsOf(RECORDING).filter((p) => p.channel !== "AF7")
    );
    expect(updates).toHaveLength(427);
  });
});

describe("windowValue gates", () => {
  const artefact = { max_ptp_uv: 150, max_muscle: 0.35 };
  const sine = (f: number, a: number) =>
    Float64Array.from(
      { length: SFREQ },
      (_, i) => a * Math.sin((2 * Math.PI * f * i) / SFREQ)
    );

  test("a pure 10 Hz sine is all alpha; a ratio divides absolute powers", () => {
    expect(windowValue([sine(10, 20)], "alpha", artefact).value).toBeCloseTo(
      1,
      2
    );
    const mixed = sine(6, 20).map((v, i) => v + sine(20, 10)[i]);
    const r = windowValue([mixed], "theta_beta", artefact).value!;
    expect(r).toBeCloseTo(4, 1);
  });

  test("flat, missing and saturated windows are refused", () => {
    expect(
      windowValue([new Float64Array(SFREQ)], "alpha", artefact).gated
    ).toBe("flat");
    const hole = sine(10, 20);
    hole[3] = Number.NaN;
    expect(windowValue([hole], "alpha", artefact).gated).toBe("gap");
    expect(windowValue([sine(10, 100)], "alpha", artefact).gated).toBe(
      "amplitude"
    );
    expect(windowValue([sine(40, 20)], "alpha", artefact).gated).toBe("muscle");
  });
});

/**
 * The contract with the backend's replay (`pipeline/features/neurofeedback.py`): windows
 * of the fixed recording and what this engine says of each. `npm run schemas` rewrites
 * it; otherwise this test fails when it is stale, and the backend's copy is checked by
 * `make schemas-check` like `blocks.schema.json`.
 */
const GOLDEN_PATH = "schemas/neurofeedback-golden.json";

function golden() {
  const cases: {
    signal: NeurofeedbackConfig["signal"];
    channels: string[];
    window_s: 1 | 2;
    artefact: NeurofeedbackConfig["artefact"];
    start: number;
    samples: number[][];
    value: number | null;
    gated: string | null;
  }[] = [];
  const add = (
    signal: NeurofeedbackConfig["signal"],
    channels: (typeof EEG_CHANNELS)[number][],
    startS: number,
    window_s: 1 | 2 = 1
  ) => {
    const artefact = { max_ptp_uv: 150, max_muscle: 0.35 };
    const start = Math.round(startS * SFREQ);
    const windows = channels.map((c) =>
      RECORDING.samples[c].subarray(start, start + window_s * SFREQ)
    );
    const result = windowValue(windows, signal, artefact);
    cases.push({
      signal,
      channels,
      window_s,
      artefact,
      start,
      samples: windows.map((w) => Array.from(w)),
      value:
        result.value === null ? null : Number(result.value.toPrecision(12)),
      gated: result.gated,
    });
  };
  add("alpha", ["TP9", "TP10"], 5);
  add("alpha", ["TP9", "TP10"], 18);
  add("alpha", ["TP9", "TP10"], 17.5, 2);
  add("theta", ["AF7", "AF8"], 8);
  add("theta", ["AF7", "AF8"], 12.2); // the blink
  add("smr", ["AF7", "AF8"], 9);
  add("beta", ["AF7"], 3);
  add("theta_beta", ["AF7", "AF8"], 6);
  add("alpha_theta", ["TP9", "TP10"], 19);
  add("alpha", ["TP9", "TP10"], 27.5); // the jaw
  return { version: 1, sfreq: SFREQ, cases };
}

test(`${GOLDEN_PATH} is up to date`, () => {
  const target = path.resolve(process.cwd(), GOLDEN_PATH);
  const text = `${JSON.stringify(golden())}\n`;
  if (process.env.SCHEMAS_WRITE === "1") {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  expect(
    readFileSync(target, "utf8"),
    `${GOLDEN_PATH} is stale: run \`npm run schemas\` and commit the result`
  ).toBe(text);
});
