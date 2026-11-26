import { describe, expect, test } from "vitest";
import en from "../../../messages/en.json";
import {
  ECG_FIGURE,
  ECG_NUMBERS,
  ENCODING,
  codeValues,
  guessFigure,
  sliderStart,
  playgroundParts,
} from "@/lib/learning/encoding";
import { MODULES, moduleOf, stepIndex } from "@/lib/learning/modules";
import { NEURAL_NETWORKS } from "@/lib/learning/neuralNetworks";
import { PLASTICITY } from "@/lib/learning/plasticity";
import {
  CAP,
  arrived,
  byThickness,
  choicesAt,
  decide,
  endRound,
  makeBraid,
  move,
  startState,
  tally,
  visibleNodes,
  MIN_WEIGHT,
  deadEnd,
  results,
  roundOver,
} from "@/lib/learning/braid";
import {
  DIG_CAP,
  WELLS,
  WORLDS,
  dropBall,
  favouriteValley,
  gaussian,
  heightAt,
  slopeAt,
  stepBall,
  valleyOf,
} from "@/lib/learning/ball";
import {
  type Dot,
  GATES,
  PAIRS,
  accuracy,
  computes,
  correctCount,
  digitPixels,
  digitSamples,
  fires,
  forward,
  gateDots,
  learnStep,
  loss,
  makeMlp,
  parameterCount,
  predict,
  sigmoid,
  trainEpoch,
  truthTable,
  twoGroups,
  xorForward,
} from "@/lib/learning/neurons";
import {
  type Question,
  formatCode,
  isCorrect,
  round,
  shuffled,
  wordsOf,
} from "@/lib/learning/questions";
import {
  ECG_BEAT,
  ECG_WAVES,
  bellAt,
  ecg,
  eegWaves,
  rmsError,
  sample,
  seeded,
  trainAt,
  valueAt,
  waveAt,
} from "@/lib/learning/signals";

/** A message under `learning.` by dotted key, or undefined. */
function message(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en.learning
    );
}

describe("signals", () => {
  test("a bell peaks at its centre with its height and halves near 1.18 sigma", () => {
    const b = { mu: 3, a: 2, sigma: 0.5 };
    expect(bellAt(b, 3)).toBeCloseTo(2);
    expect(bellAt(b, 3 + 1.1774 * 0.5)).toBeCloseTo(1, 3);
    expect(bellAt({ ...b, a: -1 }, 3)).toBeCloseTo(-1);
  });

  test("a wave repeats every 1/f and reaches its amplitude", () => {
    const w = { fn: "sin" as const, f: 2, a: 1.5 };
    expect(waveAt(w, 0.125)).toBeCloseTo(1.5);
    expect(waveAt(w, 0.3)).toBeCloseTo(waveAt(w, 0.8));
    expect(waveAt({ fn: "cos", f: 1, a: 1 }, 0)).toBeCloseTo(1);
  });

  test("a train repeats its beat at its rate", () => {
    const t = { rate: 2, bells: [{ mu: 0.25, a: 1, sigma: 0.05 }] };
    expect(trainAt(t, 0.25)).toBeCloseTo(1);
    expect(trainAt(t, 0.75)).toBeCloseTo(1);
    expect(trainAt(t, 2.25)).toBeCloseTo(trainAt(t, 0.25));
    expect(trainAt(t, 0.5)).toBeLessThan(0.01);
  });

  test("the heartbeat has eight bells and its R wave is the tallest", () => {
    expect(ECG_WAVES).toHaveLength(8);
    const tallest = ECG_WAVES.reduce((a, b) =>
      ECG_BEAT[a].a > ECG_BEAT[b].a ? a : b
    );
    expect(tallest).toBe("R");
    expect(valueAt([ecg(1)], 0.3)).toBeGreaterThan(0.9);
    expect(valueAt([ecg(1, ["P1"])], 0.3)).toBeCloseTo(0, 3);
  });

  test("the EEG is the same for the same seed and different for another", () => {
    expect(eegWaves(7)).toBe(eegWaves(7));
    const a = sample([{ type: "eeg", seed: 7 }], [0, 1], 50).y;
    const b = sample([{ type: "eeg", seed: 8 }], [0, 1], 50).y;
    expect(a).not.toEqual(b);
    expect(Math.max(...a.map(Math.abs))).toBeLessThan(2);
  });

  test("seeded numbers fall in [0, 1)", () => {
    const r = seeded(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("sample spans the domain, ends included", () => {
    const { x, y } = sample(
      [{ type: "bell", mu: 0, a: 1, sigma: 1 }],
      [-1, 1],
      3
    );
    expect(x).toEqual([-1, 0, 1]);
    expect(y[1]).toBeCloseTo(1);
  });

  test("the distance between a signal and itself is zero", () => {
    const parts = [ecg(1)];
    expect(rmsError(parts, parts, [0, 3])).toBe(0);
    expect(rmsError(parts, [ecg(2)], [0, 3])).toBeGreaterThan(0.05);
  });
});

describe("questions", () => {
  const count: Question = {
    kind: "count",
    id: "c",
    prompt: { key: "x" },
    answer: 3,
    explain: { key: "x" },
  };
  const value: Question = {
    kind: "value",
    id: "v",
    prompt: { key: "x" },
    labels: ["f", "a"],
    answer: [2, 1.5],
    tolerance: 0.1,
    explain: { key: "x" },
  };
  const choice: Question = {
    kind: "choice",
    id: "ch",
    prompt: { key: "x" },
    options: [{ id: "a", words: { key: "o" } }, { id: "b" }],
    answer: "b",
    explain: { key: "x" },
  };
  const order: Question = {
    kind: "order",
    id: "o",
    prompt: { key: "x" },
    items: [{ id: "a", words: { key: "i" } }, { id: "b" }],
    answer: ["a", "b"],
    explain: { key: "x" },
  };
  const match: Question = {
    kind: "match",
    id: "m",
    prompt: { key: "x" },
    items: [{ id: "a" }, { id: "b" }],
    slots: [
      { id: "s", count: 1 },
      { id: "t", count: 2 },
    ],
    answer: { a: "s", b: "t" },
    explain: { key: "x" },
  };

  test("each kind checks its own answer", () => {
    expect(isCorrect(count, { kind: "count", value: 3 })).toBe(true);
    expect(isCorrect(count, { kind: "count", value: 4 })).toBe(false);
    expect(isCorrect(value, { kind: "value", values: [2.05, 1.45] })).toBe(
      true
    );
    expect(isCorrect(value, { kind: "value", values: [2.2, 1.5] })).toBe(false);
    expect(isCorrect(value, { kind: "value", values: [NaN, 1.5] })).toBe(false);
    expect(isCorrect(value, { kind: "value", values: [2] })).toBe(false);
    expect(isCorrect(choice, { kind: "choice", id: "b" })).toBe(true);
    expect(isCorrect(choice, { kind: "choice", id: "a" })).toBe(false);
    expect(isCorrect(order, { kind: "order", ids: ["a", "b"] })).toBe(true);
    expect(isCorrect(order, { kind: "order", ids: ["b", "a"] })).toBe(false);
    expect(isCorrect(order, { kind: "order", ids: ["a"] })).toBe(false);
    expect(
      isCorrect(match, { kind: "match", placed: { a: "s", b: "t" } })
    ).toBe(true);
    expect(isCorrect(match, { kind: "match", placed: { a: "s" } })).toBe(false);
  });

  test("an answer of another kind is wrong", () => {
    expect(isCorrect(count, { kind: "choice", id: "3" })).toBe(false);
    expect(isCorrect(value, { kind: "count", value: 2 })).toBe(false);
    expect(isCorrect(choice, { kind: "count", value: 2 })).toBe(false);
    expect(isCorrect(order, { kind: "count", value: 2 })).toBe(false);
    expect(isCorrect(match, { kind: "count", value: 2 })).toBe(false);
  });

  test("a shuffle is stable, complete, and never the given order", () => {
    const items = ["a", "b", "c", "d"];
    const s = shuffled(items, "seed");
    expect(shuffled(items, "seed")).toEqual(s);
    expect([...s].sort()).toEqual(items);
    for (const seed of ["a", "b", "c", "d", "e", "f"])
      expect(shuffled(items, seed)).not.toEqual(items);
    expect(shuffled(["x"], "seed")).toEqual(["x"]);
  });

  test("codes are written with symbols and short numbers", () => {
    expect(
      formatCode([
        { name: "mu", value: 3 },
        { name: "sigma", value: 0.0111 },
      ])
    ).toBe("μ = 3, σ = 0.011");
    expect(round(1.5)).toBe("1.5");
  });

  test("wordsOf lists the prompt, the explanation and every worded item", () => {
    expect(wordsOf(choice).map((w) => w.key)).toEqual(["x", "x", "o"]);
    expect(wordsOf(order).map((w) => w.key)).toEqual(["x", "x", "i"]);
    expect(wordsOf(count)).toHaveLength(2);
  });
});

describe("the Encoding module", () => {
  const questions = ENCODING.flatMap((s) => s.questions);

  test("every step and every question has its words in the catalogue", () => {
    for (const step of ENCODING) {
      expect(message(`encoding.steps.${step.id}.title`)).toBeTypeOf("string");
      expect(message(`encoding.steps.${step.id}.body`)).toBeTypeOf("string");
    }
    for (const q of questions)
      for (const w of wordsOf(q))
        expect(message(w.key), w.key).toBeTypeOf("string");
  });

  test("question ids are unique", () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every answer names the question's own items, options and slots", () => {
    for (const q of questions) {
      if (q.kind === "choice")
        expect(q.options.map((o) => o.id)).toContain(q.answer);
      if (q.kind === "order")
        expect([...q.answer].sort()).toEqual(q.items.map((i) => i.id).sort());
      if (q.kind === "match") {
        expect(Object.keys(q.answer).sort()).toEqual(
          q.items.map((i) => i.id).sort()
        );
        const slots = q.slots.map((s) => s.id);
        expect(new Set(Object.values(q.answer)).size).toBe(q.items.length);
        for (const slot of Object.values(q.answer))
          expect(slots).toContain(slot);
      }
      if (q.kind === "value") expect(q.labels).toHaveLength(q.answer.length);
    }
  });

  test("a matched picture is drawn from the code of its slot", () => {
    for (const q of questions) {
      if (q.kind !== "match") continue;
      for (const item of q.items) {
        const slot = q.slots.find((s) => s.id === q.answer[item.id]);
        if (!slot?.code || item.figure?.kind !== "plane") continue;
        expect(codeValues(slot.code)).toEqual({
          x: item.figure.x,
          y: item.figure.y,
        });
      }
    }
  });

  test("a heartbeat takes 25 numbers", () => {
    expect(ECG_NUMBERS).toBe(25);
    expect(ECG_FIGURE.kind).toBe("signal");
  });

  test("every playground's target is reachable with its sliders", () => {
    for (const step of ENCODING) {
      const p = step.playground;
      if (!p) continue;
      for (const { name, value } of p.target) {
        const s = p.sliders.find((x) => x.name === name);
        expect(s, name).toBeDefined();
        if (!s) continue;
        expect(value).toBeGreaterThanOrEqual(s.min);
        expect(value).toBeLessThanOrEqual(s.max);
        const steps = (value - s.min) / s.step;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
      }
      const target = playgroundParts(p.model, codeValues(p.target));
      expect(rmsError(target, target, p.domain)).toBe(0);
    }
  });

  test("playground parts fall back to defaults", () => {
    expect(playgroundParts("bell", {})).toEqual([
      { type: "bell", mu: 5, a: 1, sigma: 1 },
    ]);
    expect(playgroundParts("wave", {})[0].type).toBe("wave");
    expect(playgroundParts("train", {})[0].type).toBe("train");
  });
});

describe("modules", () => {
  test("the course: Neural networks, Encoding, Brain plasticity", () => {
    expect(MODULES.map((m) => m.slug)).toEqual([
      "neural-networks",
      "encoding",
      "brain-plasticity",
    ]);
    expect(MODULES.filter((m) => m.steps.length).map((m) => m.key)).toEqual([
      "neuralNetworks",
      "encoding",
      "plasticity",
    ]);
    for (const m of MODULES) {
      expect(message(`modules.${m.key}.name`)).toBeTypeOf("string");
      expect(message(`modules.${m.key}.blurb`)).toBeTypeOf("string");
    }
  });

  test("moduleOf finds a module by slug", () => {
    expect(moduleOf("encoding")?.key).toBe("encoding");
    expect(moduleOf("nope")).toBeNull();
  });

  test("the step in the address counts from one and is clamped", () => {
    expect(stepIndex(null, 13)).toBe(0);
    expect(stepIndex("1", 13)).toBe(0);
    expect(stepIndex("7", 13)).toBe(6);
    expect(stepIndex("99", 13)).toBe(12);
    expect(stepIndex("-3", 13)).toBe(0);
    expect(stepIndex("abc", 13)).toBe(0);
    expect(stepIndex("3", 0)).toBe(0);
  });
});

describe("the Neural Networks module", () => {
  const questions = NEURAL_NETWORKS.flatMap((s) => s.questions);

  test("every step and question has its words", () => {
    for (const step of NEURAL_NETWORKS) {
      expect(message(`neuralNetworks.steps.${step.id}.title`)).toBeTypeOf(
        "string"
      );
      expect(message(`neuralNetworks.steps.${step.id}.body`)).toBeTypeOf(
        "string"
      );
    }
    for (const q of questions)
      for (const w of wordsOf(q))
        expect(message(w.key), w.key).toBeTypeOf("string");
  });

  test("question ids are unique across the course", () => {
    const ids = MODULES.flatMap((m) =>
      m.steps.flatMap((s) => s.questions.map((q) => q.id))
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the numbers in the questions are the ones the labs compute", () => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    expect(byId.get("nnXorParams")).toMatchObject({ answer: 9 });
    expect(byId.get("nnDigitParams")).toMatchObject({ answer: 562 });
    expect(computes({ w1: 1, w2: 1, b: -1.5 }, "and")).toBe(true);
    const line = byId.get("nnWhichLine");
    if (line?.kind !== "choice") throw new Error("nnWhichLine");
    for (const o of line.options) {
      if (o.figure?.kind !== "dots" || !o.figure.line) throw new Error(o.id);
      const right = correctCount(o.figure.line, o.figure.dots as Dot[]);
      expect(right === o.figure.dots.length, o.id).toBe(o.id === line.answer);
    }
  });
});

describe("neurons", () => {
  test("a neuron computes AND and OR but no weights give XOR", () => {
    expect(truthTable({ w1: 1, w2: 1, b: -0.5 })).toEqual(GATES.or);
    expect(computes({ w1: 1, w2: 1, b: -1.5 }, "and")).toBe(true);
    for (let w1 = -2; w1 <= 2; w1 += 0.5)
      for (let w2 = -2; w2 <= 2; w2 += 0.5)
        for (let b = -2; b <= 2; b += 0.25)
          expect(computes({ w1, w2, b }, "xor")).toBe(false);
  });

  test("the hidden layer computes XOR", () => {
    expect(PAIRS.map(([a, b]) => xorForward(a, b).out)).toEqual(GATES.xor);
  });

  test("gate dots carry the gate's labels and two groups are separable", () => {
    const dots = gateDots("xor", 2);
    expect(dots).toHaveLength(8);
    expect(dots.map((d) => d.label)).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
    const groups = twoGroups();
    expect(correctCount({ w1: 1, w2: 1, b: -1 }, groups)).toBe(groups.length);
  });

  test("learning lowers the error and finds a separating line", () => {
    const dots = twoGroups();
    let n = { w1: -1, w2: 1.5, b: 0.2 };
    const before = loss(n, dots);
    for (let i = 0; i < 200; i++) n = learnStep(n, dots, 2);
    expect(loss(n, dots)).toBeLessThan(before / 3);
    expect(correctCount(n, dots)).toBe(dots.length);
    expect(sigmoid(0)).toBe(0.5);
    expect(fires(n, 0.8, 0.8)).toBe(1);
  });

  test("parameters are weights plus biases, layer by layer", () => {
    expect(parameterCount([2, 2, 1])).toBe(9);
    expect(parameterCount([35, 12, 10])).toBe(562);
  });

  test("a small network learns the digits and reads new ones", () => {
    expect(digitPixels(1)).toHaveLength(35);
    const train = digitSamples(20, 0.08, 5);
    const test = digitSamples(10, 0.08, 99);
    let net = makeMlp(35, 12, 10, 1);
    const before = accuracy(net, test);
    for (let i = 0; i < 15; i++) net = trainEpoch(net, train, 0.5);
    expect(accuracy(net, test)).toBeGreaterThan(0.9);
    expect(before).toBeLessThan(0.5);
    for (let d = 0; d < 10; d++) expect(predict(net, digitPixels(d))).toBe(d);
    const { hidden, probs } = forward(net, digitPixels(3));
    expect(hidden).toHaveLength(12);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(accuracy(net, [])).toBe(0);
  });
});

describe("the Brain Plasticity module", () => {
  test("every step, question and link has its words", () => {
    for (const step of PLASTICITY) {
      expect(message(`plasticity.steps.${step.id}.title`)).toBeTypeOf("string");
      expect(message(`plasticity.steps.${step.id}.body`)).toBeTypeOf("string");
      for (const l of step.links ?? [])
        expect(message(l.words.key), l.words.key).toBeTypeOf("string");
    }
    for (const q of PLASTICITY.flatMap((s) => s.questions))
      for (const w of wordsOf(q))
        expect(message(w.key), w.key).toBeTypeOf("string");
  });

  test("a figure that answers the questions waits for the reveal", () => {
    const lifespan = PLASTICITY.find((s) => s.id === "lifespan")!;
    expect(lifespan.figureAnswers).toBe(true);
    for (const st of [...PLASTICITY, ...ENCODING, ...NEURAL_NETWORKS])
      if (st.figureAnswers) expect(st.reveal, st.id).toBe(true);
  });

  test("true/false questions have exactly the two options", () => {
    for (const q of PLASTICITY.flatMap((s) => s.questions))
      if (q.kind === "choice" && q.id.startsWith("plTf"))
        expect(q.options.map((o) => o.id)).toEqual(["true", "false"]);
  });
});

describe("the braided path", () => {
  const braid = makeBraid(4);

  test("is the same for the same seed and every node is reachable", () => {
    expect(makeBraid(4)).toEqual(braid);
    expect(braid.nodes[braid.start].kind).toBe("start");
    for (const n of braid.nodes)
      if (n.kind !== "start")
        expect(
          braid.edges.some((e) => e.to === n.id),
          String(n.id)
        ).toBe(true);
  });

  test("a walk reaches the end in about ten choices", () => {
    let s = startState(braid);
    const rand = seeded(1);
    while (!arrived(braid, s) && s.steps < 100) {
      const forward = choicesAt(braid, s).filter(
        (e) => braid.nodes[e.to].kind !== "dead"
      );
      s = move(braid, s, forward[Math.floor(rand() * forward.length)].id);
    }
    expect(arrived(braid, s)).toBe(true);
    expect(s.steps).toBe(9);
  });

  test("votes count with thickness and nothing moves before the time is up", () => {
    let s = startState(braid);
    const [a, b] = choicesAt(braid, s).map((e) => e.id);
    expect(tally(braid, s, { [a]: 3, [b]: 1, nope: 9 })).toMatchObject({
      [a]: 3,
      [b]: 1,
    });
    expect(decide(braid, s, { [a]: 10 }, 10)).toBeNull();
    expect(decide(braid, s, { [a]: 7 }, 10, { timedOut: true })).toBe(a);
    s = { ...s, weights: { ...s.weights, [a]: 3 } };
    expect(decide(braid, s, { [a]: 2, [b]: 5 }, 10, { timedOut: true })).toBe(
      a
    );
    expect(decide(braid, s, { [a]: 1, [b]: 4 }, 10, { timedOut: true })).toBe(
      b
    );
    expect(
      decide(braid, s, { [a]: 1, [b]: 4 }, 10, { timedOut: false })
    ).toBeNull();
  });

  test("a tie at the deadline goes by thickness", () => {
    const s = startState(braid);
    const ids = choicesAt(braid, s).map((e) => e.id);
    const heavy = { ...s, weights: { ...s.weights, [ids[0]]: 4 } };
    expect(
      decide(braid, heavy, {}, 10, { timedOut: true, rand: () => 0.01 })
    ).toBe(ids[0]);
    expect(byThickness(["x", "y"], { x: 1, y: 3 }, () => 0.9)).toBe("y");
    expect(byThickness(["x", "y"], { x: 1, y: 3 }, () => 0.2)).toBe("x");
    expect(byThickness(["x"], {}, () => 2)).toBe("x");
  });

  test("crossing thickens up to the cap, unused edges thin", () => {
    let s = startState(braid);
    const id = choicesAt(braid, s)[0].id;
    for (let i = 0; i < 10; i++) s = move(braid, { ...s, at: braid.start }, id);
    expect(s.weights[id]).toBe(CAP);
    expect(move(braid, s, "nope")).toBe(s);
    const other = braid.edges.find((e) => e.id !== id)!.id;
    const thick = { ...s, weights: { ...s.weights, [other]: 3 } };
    const next = endRound(braid, thick);
    expect(next.weights[id]).toBe(CAP);
    expect(next.weights[other]).toBeLessThan(3);
    expect(next.round).toBe(2);
    expect(next.at).toBe(braid.start);
    const thin = endRound(braid, { ...s, weights: { [other]: 0.5 }, used: [] });
    expect(thin.weights[other]).toBe(0.5);
  });

  test("some paths lead to a dead spot: game over, the edge pruned, a new round", () => {
    const deadNodes = braid.nodes.filter((n) => n.kind === "dead");
    // dead spots beside nodes and inside the tangle, which has no way on from them
    expect(deadNodes.length).toBeGreaterThan(3);
    const inner = deadNodes.filter((n) =>
      braid.edges.some(
        (e) => e.to === n.id && braid.nodes[e.from].kind === "mid"
      )
    );
    expect(inner.length).toBeGreaterThan(0);
    for (const n of deadNodes)
      expect(braid.edges.some((e) => e.from === n.id)).toBe(false);
    const deadEdge = braid.edges.find(
      (e) => braid.nodes[e.to].kind === "dead"
    )!;
    const at = { ...startState(braid), at: deadEdge.from, steps: 3 };
    const died = move(braid, at, deadEdge.id);
    expect(deadEnd(braid, died)).toBe(true);
    expect(roundOver(braid, died)).toBe(true);
    expect(arrived(braid, died)).toBe(false);
    expect(died.weights[deadEdge.id]).toBe(MIN_WEIGHT);
    expect(results(braid, died)).toEqual([{ steps: 4, arrived: false }]);
    const next = endRound(braid, died);
    expect(next.at).toBe(braid.start);
    expect(next.finished).toEqual([{ steps: 4, arrived: false }]);
  });

  test("every live node has a live way on, so the end is always reachable", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = makeBraid(seed);
      for (const n of b.nodes)
        if (n.kind === "start" || n.kind === "mid")
          expect(
            b.edges.some(
              (e) => e.from === n.id && b.nodes[e.to].kind !== "dead"
            ),
            `${seed}:${n.id}`
          ).toBe(true);
    }
  });

  test("the fog shows two hops around the pointer, and always the end", () => {
    const s = startState(braid);
    const near = visibleNodes(braid, s);
    expect(near.has(braid.start)).toBe(true);
    expect(near.has(braid.end)).toBe(true);
    expect(near.size).toBeLessThan(braid.nodes.length);
    expect(visibleNodes(braid, s, 99).size).toBe(braid.nodes.length);
  });
});

describe("the ball on the landscape", () => {
  const run = (name: keyof typeof WORLDS, x: number, steps = 6000) => {
    const world = WORLDS[name];
    let b = dropBall(world, x);
    const r = seeded(3);
    for (let i = 0; i < steps; i++) b = stepBall(world, b, 0.01, r);
    return b;
  };

  test("with much friction it settles in the nearest valley", () => {
    const b = run("stuck", 3.4);
    expect(b.x).toBeCloseTo(WELLS[0].c, 1);
    expect(favouriteValley(b)).toBe(0);
    expect(favouriteValley(dropBall(WORLDS.stuck, 1))).toBe(-1);
  });

  test("with little friction it visits several valleys", () => {
    const b = run("rocking", 0.4);
    expect(b.time.filter((t) => t > 1).length).toBeGreaterThan(1);
  });

  test("the restless ball changes valley, the soft one digs, never past the cap", () => {
    expect(
      run("restless", 2.2).time.filter((t) => t > 1).length
    ).toBeGreaterThan(1);
    const soft = run("soft", 2.2);
    expect(Math.max(...soft.dug)).toBeGreaterThan(0.5);
    expect(Math.max(...soft.dug)).toBeLessThanOrEqual(DIG_CAP);
    expect(heightAt(WORLDS.soft, soft, soft.x)).toBeLessThan(
      heightAt(WORLDS.soft, null, soft.x)
    );
  });

  test("the wind makes the target valley the favourite", () => {
    expect(favouriteValley(run("wind", 6))).toBe(1);
  });

  test("helpers", () => {
    expect(valleyOf({ ...WORLDS.stuck, wells: [] }, 3)).toBe(-1);
    expect(
      slopeAt(WORLDS.stuck, dropBall(WORLDS.stuck, 0), WELLS[2].c)
    ).toBeCloseTo(0, 1);
    const g = Array.from(
      { length: 2000 },
      (
        (r) => () =>
          gaussian(r)
      )(seeded(2))
    );
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    // bounces off both ends
    const fast = { ...dropBall(WORLDS.stuck, 0.1), v: -50 };
    expect(
      stepBall(WORLDS.stuck, fast, 0.01, seeded(1)).x
    ).toBeGreaterThanOrEqual(0);
    const right = { ...dropBall(WORLDS.stuck, 9.9), v: 50 };
    expect(
      stepBall(WORLDS.stuck, right, 0.01, seeded(1)).x
    ).toBeLessThanOrEqual(10);
  });
});

describe("encoding questions do not give their answers away", () => {
  const values = ENCODING.flatMap((s) => s.questions).filter(
    (q): q is Extract<Question, { kind: "value" }> => q.kind === "value"
  );

  test("every value question is answered on sliders that can reach the answer", () => {
    for (const q of values) {
      expect(q.sliders, q.id).toHaveLength(q.labels.length);
      q.answer.forEach((v, i) => {
        const s = q.sliders![i];
        expect(v, q.id).toBeGreaterThanOrEqual(s.min);
        expect(v, q.id).toBeLessThanOrEqual(s.max);
        const steps = (v - s.min) / s.step;
        expect(Math.abs(steps - Math.round(steps)), q.id).toBeLessThan(1e-6);
      });
      // the sliders do not start on the answer, and the answer itself is right
      expect(
        isCorrect(q, { kind: "value", values: sliderStart(q) }),
        q.id
      ).toBe(false);
      expect(isCorrect(q, { kind: "value", values: q.answer }), q.id).toBe(
        true
      );
      expect(guessFigure(q, q.answer, true), q.id).not.toBeNull();
    }
  });

  test("steps that hold back their explanation have one, and ask first", () => {
    const steps = en.learning.encoding.steps as Record<
      string,
      { body: string; reveal?: string }
    >;
    for (const s of ENCODING.filter((s) => s.reveal)) {
      expect(steps[s.id].reveal, s.id).toBeTruthy();
      if (!s.gallery) continue;
      expect(s.questions[0].kind, s.id).toBe("count");
      expect(s.questions[1].kind, s.id).toBe("value");
    }
  });

  test("every step that holds back its explanation has one, in every module", () => {
    for (const m of MODULES)
      for (const s of m.steps.filter((s) => s.reveal)) {
        const step = (
          en.learning as unknown as Record<
            string,
            { steps: Record<string, { reveal?: string }> }
          >
        )[m.key].steps[s.id];
        expect(step.reveal, `${m.key}.${s.id}`).toBeTruthy();
      }
  });

  test("multiple choices offer four options, true/false two", () => {
    for (const m of MODULES)
      for (const q of m.steps.flatMap((s) => s.questions))
        if (q.kind === "choice")
          expect([2, 4], `${m.key}.${q.id}`).toContain(q.options.length);
  });
});
