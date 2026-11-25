/**
 * The Brain Plasticity module, the course's third: the bridge from the two technical
 * modules to the neuroscience behind training a brain.
 *
 * It opens with the braided path (the class as a signal whose routes thicken with use:
 * Hebb's rule, felt), then how plasticity changes from birth to old age, what that means
 * for learning and habits (true/false votes, habits from Lally et al. 2010), the brain at
 * scale as patterns of activity (a city at night), and the energy landscape in four
 * versions: hard, restless, soft (plasticity digs the valleys it uses) and with the wind
 * of neurofeedback, before the demo of the real Brain Landscape. About twenty minutes.
 *
 * Theories are said to be theories (metaplasticity, predictive coding) and the evidence
 * for neurofeedback is described as it is: promising, mixed, still being tested.
 */
import type { Step } from "@/lib/learning/encoding";
import type { Words } from "@/lib/learning/questions";

const w = (key: string): Words => ({ key: `plasticity.${key}` });

function options(question: string, ids: string[]) {
  return ids.map((id) => ({ id, words: w(`q.${question}.options.${id}`) }));
}

/** A true/false statement for a class vote: two options, `true` and `false`. */
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

export const PLASTICITY: Step[] = [
  {
    id: "braid",
    lab: "braid",
    questions: [
      {
        kind: "choice",
        id: "plBraidWhy",
        prompt: w("q.plBraidWhy.prompt"),
        options: options("plBraidWhy", ["thick", "memory", "luck"]),
        answer: "thick",
        explain: w("q.plBraidWhy.explain"),
      },
    ],
  },
  {
    id: "hebb",
    figure: { kind: "neuron" },
    questions: [
      trueFalse("plTfContinuous", true),
      trueFalse("plTfUnused", true),
    ],
  },
  {
    id: "lifespan",
    figure: { kind: "lifespan" },
    questions: [
      trueFalse("plTf25", false),
      trueFalse("plTfToddler", true),
      {
        kind: "choice",
        id: "plMeta",
        prompt: w("q.plMeta.prompt"),
        options: options("plMeta", ["meta", "age", "fixed"]),
        answer: "meta",
        explain: w("q.plMeta.explain"),
      },
    ],
  },
  {
    id: "habits",
    questions: [
      {
        kind: "choice",
        id: "plHabitDays",
        prompt: w("q.plHabitDays.prompt"),
        options: options("plHabitDays", [
          "seven",
          "twentyOne",
          "sixtySix",
          "year",
        ]),
        answer: "sixtySix",
        explain: w("q.plHabitDays.explain"),
      },
      trueFalse("plTfMissDay", false),
      trueFalse("plTfRepeat", true),
    ],
  },
  {
    id: "city",
    lab: "city",
    questions: [
      {
        kind: "choice",
        id: "plState",
        prompt: w("q.plState.prompt"),
        options: options("plState", ["pattern", "region", "thought"]),
        answer: "pattern",
        explain: w("q.plState.explain"),
      },
    ],
  },
  {
    id: "landscape",
    lab: "ballHard",
    questions: [
      {
        kind: "choice",
        id: "plValley",
        prompt: w("q.plValley.prompt"),
        options: options("plValley", ["state", "region", "mistake"]),
        answer: "state",
        explain: w("q.plValley.explain"),
      },
    ],
  },
  {
    id: "restless",
    lab: "ballRestless",
    questions: [trueFalse("plTfNoise", true)],
  },
  {
    id: "soft",
    lab: "ballSoft",
    questions: [
      {
        kind: "choice",
        id: "plStuck",
        prompt: w("q.plStuck.prompt"),
        options: options("plStuck", ["outside", "wait", "nothing"]),
        answer: "outside",
        explain: w("q.plStuck.explain"),
      },
      trueFalse("plTfPredict", true),
    ],
  },
  {
    id: "wind",
    lab: "ballWind",
    questions: [
      trueFalse("plTfForce", false),
      {
        kind: "choice",
        id: "plReward",
        prompt: w("q.plReward.prompt"),
        options: options("plReward", ["now", "later", "never"]),
        answer: "now",
        explain: w("q.plReward.explain"),
      },
    ],
  },
  {
    id: "demo",
    links: [
      { href: "/landscape", words: { key: "demo.landscape" } },
      { href: "/neurofeedback", words: { key: "demo.neurofeedback" } },
    ],
    questions: [
      {
        kind: "order",
        id: "plRecap",
        prompt: w("q.plRecap.prompt"),
        items: ["use", "valleys", "stuck", "nudge"].map((id) => ({
          id,
          words: w(`q.plRecap.steps.${id}`),
        })),
        answer: ["use", "valleys", "stuck", "nudge"],
        explain: w("q.plRecap.explain"),
      },
    ],
  },
];
