/**
 * The Neural Networks module, the course's first: from one artificial neuron to a small
 * network that learns to read handwritten digits.
 *
 * One neuron is a switch with weights (it computes AND: which table does it match?); the
 * brain's neuron it is a cartoon of; classification is a line between two groups of dots,
 * and the neuron's numbers are that line, so moving them teaches it OR; a line cannot
 * split XOR, a hidden layer can; a network finds its weights itself by sending its error
 * back (backpropagation) over a dataset; and a network trained on digits keeps a short
 * description of each picture in its hidden layer. That last point is where Encoding
 * picks up: this module does not name autoencoders, Encoding ends with them.
 *
 * The words are under `learning.neuralNetworks` in `messages/*.json`; the labs are in
 * `NeuronLabs`, their arithmetic in `@/lib/learning/neurons`.
 */
import type { Step } from "@/lib/learning/encoding";
import {
  DIGIT_H,
  DIGIT_W,
  digitPixels,
  digitSamples,
  gateDots,
  parameterCount,
  twoGroups,
} from "@/lib/learning/neurons";
import type { Words } from "@/lib/learning/questions";

const w = (key: string): Words => ({ key: `neuralNetworks.${key}` });

function options(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.options.${id}`) }));
}

function steps(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.steps.${id}`) }));
}

/** A true/false statement for the recap: two options, `true` and `false`. */
function trueFalse(id: string, answer: boolean) {
  return {
    kind: "choice" as const,
    id,
    prompt: w(`q.${id}.prompt`),
    options: [
      { id: "true", words: { key: "question.true" } },
      { id: "false", words: { key: "question.false" } },
    ],
    answer: answer ? "true" : "false",
    explain: w(`q.${id}.explain`),
  };
}

/** The digit network's sizes: 35 pixels in, 12 hidden neurons, 10 digits out. */
export const DIGIT_LAYERS = [DIGIT_W * DIGIT_H, 12, 10];

const noisy = digitSamples(1, 0.1, 42);

export const NEURAL_NETWORKS: Step[] = [
  {
    id: "neuron",
    lab: "gates",
    questions: [
      {
        kind: "choice",
        id: "nnWhichGate",
        prompt: w("q.nnWhichGate.prompt"),
        options: options("nnWhichGate", ["and", "or", "xor", "neither"]),
        answer: "and",
        explain: w("q.nnWhichGate.explain"),
      },
      {
        kind: "count",
        id: "nnNeuronCount",
        prompt: w("q.nnNeuronCount.prompt"),
        answer: 3,
        explain: w("q.nnNeuronCount.explain"),
      },
    ],
  },
  {
    id: "biology",
    reveal: true,
    figure: { kind: "bioNeuron" },
    questions: [
      {
        kind: "match",
        id: "nnBiology",
        prompt: w("q.nnBiology.prompt"),
        items: (
          [
            ["dendrites", "dendrites"],
            ["synapse", "synapse"],
            ["body", "body"],
            ["spike", "axon"],
          ] as const
        ).map(([id, part]) => ({
          id,
          words: w(`q.nnBiology.items.${id}`),
          figure: { kind: "bioNeuron" as const, highlight: part },
        })),
        slots: [
          { id: "weights", words: w("q.nnBiology.slots.weights") },
          { id: "fires", words: w("q.nnBiology.slots.fires") },
          { id: "inputs", words: w("q.nnBiology.slots.inputs") },
          { id: "sum", words: w("q.nnBiology.slots.sum") },
        ],
        answer: {
          dendrites: "inputs",
          synapse: "weights",
          body: "sum",
          spike: "fires",
        },
        explain: w("q.nnBiology.explain"),
      },
    ],
  },
  {
    id: "line",
    lab: "classify",
    questions: [
      {
        kind: "choice",
        id: "nnWhichLine",
        prompt: w("q.nnWhichLine.prompt"),
        options: [
          {
            id: "a",
            figure: {
              kind: "dots",
              dots: twoGroups(),
              line: { w1: 1, w2: 0, b: -0.9 },
            },
          },
          {
            id: "b",
            figure: {
              kind: "dots",
              dots: twoGroups(),
              line: { w1: 1, w2: 1, b: -1 },
            },
          },
          {
            id: "c",
            figure: {
              kind: "dots",
              dots: twoGroups(),
              line: { w1: -1, w2: -1, b: 1 },
            },
          },
          {
            id: "d",
            figure: {
              kind: "dots",
              dots: twoGroups(),
              line: { w1: 0, w2: 1, b: -0.75 },
            },
          },
        ],
        answer: "b",
        explain: w("q.nnWhichLine.explain"),
      },
    ],
  },
  {
    id: "teach",
    lab: "gatesLearn",
    questions: [
      {
        kind: "choice",
        id: "nnBias",
        prompt: w("q.nnBias.prompt"),
        options: options("nnBias", ["slides", "turns", "colours", "nothing"]),
        answer: "slides",
        explain: w("q.nnBias.explain"),
      },
    ],
  },
  {
    id: "xor",
    lab: "lineXor",
    questions: [
      {
        kind: "choice",
        id: "nnXorBest",
        prompt: w("q.nnXorBest.prompt"),
        figures: [{ kind: "dots", dots: gateDots("xor") }],
        options: options("nnXorBest", ["one", "two", "three", "four"]),
        answer: "three",
        explain: w("q.nnXorBest.explain"),
      },
    ],
  },
  {
    id: "hidden",
    reveal: true,
    lab: "xor",
    questions: [
      {
        kind: "count",
        id: "nnXorParams",
        prompt: w("q.nnXorParams.prompt"),
        figures: [{ kind: "network", layers: [2, 2, 1] }],
        answer: parameterCount([2, 2, 1]),
        explain: w("q.nnXorParams.explain"),
      },
      {
        kind: "choice",
        id: "nnHiddenOne",
        prompt: w("q.nnHiddenOne.prompt"),
        options: options("nnHiddenOne", ["or", "and", "xor", "nand"]),
        answer: "or",
        explain: w("q.nnHiddenOne.explain"),
      },
    ],
  },
  {
    id: "learning",
    reveal: true,
    lab: "learn",
    questions: [
      {
        kind: "choice",
        id: "nnNudgeDown",
        prompt: w("q.nnNudgeDown.prompt"),
        options: options("nnNudgeDown", ["up", "down", "same", "zero"]),
        answer: "down",
        explain: w("q.nnNudgeDown.explain"),
      },
      {
        kind: "choice",
        id: "nnNudgeZero",
        prompt: w("q.nnNudgeZero.prompt"),
        options: options("nnNudgeZero", ["up", "down", "same", "zero"]),
        answer: "same",
        explain: w("q.nnNudgeZero.explain"),
      },
      {
        kind: "order",
        id: "nnBackprop",
        prompt: w("q.nnBackprop.prompt"),
        items: steps("nnBackprop", [
          "forward",
          "compare",
          "back",
          "nudge",
          "repeat",
        ]),
        answer: ["forward", "compare", "back", "nudge", "repeat"],
        explain: w("q.nnBackprop.explain"),
      },
    ],
  },
  {
    id: "digits",
    reveal: true,
    lab: "digits",
    questions: [
      {
        kind: "count",
        id: "nnDigitParams",
        prompt: w("q.nnDigitParams.prompt"),
        figures: [{ kind: "network", layers: DIGIT_LAYERS }],
        answer: parameterCount(DIGIT_LAYERS),
        explain: w("q.nnDigitParams.explain"),
      },
      {
        kind: "choice",
        id: "nnWhyMany",
        prompt: w("q.nnWhyMany.prompt"),
        figures: [
          { kind: "pixels", pixels: digitPixels(3), width: DIGIT_W },
          { kind: "pixels", pixels: noisy[3].pixels, width: DIGIT_W },
        ],
        options: options("nnWhyMany", ["shape", "memory", "faster", "pixels"]),
        answer: "shape",
        explain: w("q.nnWhyMany.explain"),
      },
      {
        kind: "choice",
        id: "nnHiddenCode",
        prompt: w("q.nnHiddenCode.prompt"),
        options: options("nnHiddenCode", [
          "summary",
          "copy",
          "answer",
          "random",
        ]),
        answer: "summary",
        explain: w("q.nnHiddenCode.explain"),
      },
    ],
  },
  {
    id: "recap",
    reveal: true,
    questions: [
      trueFalse("nnTfThreshold", true),
      trueFalse("nnTfXorOne", false),
      trueFalse("nnTfHidden", true),
      trueFalse("nnTfByHand", false),
      trueFalse("nnTfBackprop", true),
    ],
  },
];
