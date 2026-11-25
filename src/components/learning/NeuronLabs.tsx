"use client";

/**
 * The Neural Networks module's labs: small machines the class plays with.
 *
 * - `gates`: one neuron with two switches as inputs; its weights and bias on sliders;
 *   find the numbers that make it AND, then OR.
 * - `line` / `lineXor`: the same neuron as a line across dots; split two groups, then
 *   try (and fail) on XOR.
 * - `xor`: the hand-wired network with one hidden layer that does compute XOR.
 * - `learn`: the neuron finds its own line, a gradient step at a time.
 * - `digits`: a small network learns to read 5x7 digits, then reads the class's own.
 *
 * All the arithmetic is in `@/lib/learning/neurons`; this file only draws and listens.
 */
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button, Card, Icon, Segmented, cn } from "@/components/ui";
import {
  DotsFigure,
  GROUP_COLOURS,
  NetworkFigure,
  PixelsFigure,
} from "@/components/learning/LearningFigure";
import type { Lab } from "@/lib/learning/encoding";
import {
  DIGIT_H,
  DIGIT_W,
  GATES,
  type Gate,
  type Mlp,
  type Neuron2,
  PAIRS,
  XOR_NET,
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
  trainEpoch,
  truthTable,
  twoGroups,
  xorForward,
} from "@/lib/learning/neurons";
import { round } from "@/lib/learning/questions";

export function NeuronLab({ lab }: { lab: Exclude<Lab, "ecg"> }) {
  switch (lab) {
    case "gates":
      return <GatesLab />;
    case "line":
      return <LineLab gate={null} />;
    case "lineXor":
      return <LineLab gate="xor" />;
    case "xor":
      return <XorLab />;
    case "learn":
      return <LearnLab />;
    case "digits":
      return <DigitsLab />;
  }
}

/** Sliders for a two-input neuron's weights and bias. */
function NeuronSliders({
  neuron,
  onChange,
  range = 2,
}: {
  neuron: Neuron2;
  onChange: (n: Neuron2) => void;
  range?: number;
}) {
  const names: [keyof Neuron2, string][] = [
    ["w1", "w₁"],
    ["w2", "w₂"],
    ["b", "b"],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {names.map(([k, symbol]) => (
        <label key={k} className="block">
          <span className="flex justify-between font-mono text-[14px] tabular-nums">
            <span>{symbol}</span>
            <span>{round(neuron[k])}</span>
          </span>
          <input
            type="range"
            min={-range}
            max={range}
            step={0.1}
            value={neuron[k]}
            onChange={(e) =>
              onChange({ ...neuron, [k]: Number(e.target.value) })
            }
            className="w-full accent-[var(--accent)]"
          />
        </label>
      ))}
    </div>
  );
}

function Lamp({ on, label }: { on: boolean; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-mono text-[14px] font-semibold",
        on ? "bg-accent text-on-accent" : "bg-surface-2 text-ink-3"
      )}
    >
      {label ?? (on ? 1 : 0)}
    </span>
  );
}

function GatesLab() {
  const t = useTranslations("learning.labs");
  const [neuron, setNeuron] = useState<Neuron2>({ w1: 0.5, w2: -0.5, b: 0 });
  const [gate, setGate] = useState<Exclude<Gate, "xor">>("and");
  const [x, setX] = useState<[number, number]>([1, 0]);
  const table = truthTable(neuron);
  const sum = neuron.w1 * x[0] + neuron.w2 * x[1] + neuron.b;
  const done = computes(neuron, gate);
  return (
    <Card className="space-y-5">
      <div>
        <h3 className="type-subhead">{t("gates.title")}</h3>
        <p className="mt-1 text-ink-2">{t("gates.text")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-4">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() =>
              setX((v) => {
                const next: [number, number] = [...v];
                next[i] = 1 - next[i];
                return next;
              })
            }
            className="pressable flex items-center gap-2 rounded-full border border-hairline-strong bg-surface px-3 py-1.5"
          >
            <span className="font-mono">{i ? "x₂" : "x₁"}</span>
            <Lamp on={x[i] === 1} />
          </button>
        ))}
        <span className="font-mono text-ink-2 tabular-nums">
          {t("gates.sum", { s: round(sum) })}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-ink-2">{t("gates.output")}</span>
          <Lamp on={fires(neuron, x[0], x[1]) === 1} />
        </span>
      </div>
      <NeuronSliders neuron={neuron} onChange={setNeuron} />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t("gates.goal")}
          value={gate}
          onChange={setGate}
          options={[
            { value: "and", label: t("gates.and") },
            { value: "or", label: t("gates.or") },
          ]}
        />
        {done && (
          <span className="inline-flex items-center gap-1.5 font-medium text-ok">
            <Icon name="check" /> {t("gates.done")}
          </span>
        )}
      </div>
      <table className="w-full max-w-sm text-center font-mono tabular-nums">
        <thead className="text-ink-3">
          <tr>
            <th className="font-normal">{"x₁"}</th>
            <th className="font-normal">{"x₂"}</th>
            <th className="font-normal">{t("gates.wanted")}</th>
            <th className="font-normal">{t("gates.neuron")}</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map(([a, b], i) => (
            <tr key={i} className="border-t border-hairline">
              <td className="py-1.5">{a}</td>
              <td>{b}</td>
              <td>{GATES[gate][i]}</td>
              <td
                className={
                  table[i] === GATES[gate][i] ? "text-ok" : "text-warn"
                }
              >
                {table[i]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LineLab({ gate }: { gate: Gate | null }) {
  const t = useTranslations("learning.labs");
  const dots = useMemo(() => (gate ? gateDots(gate) : twoGroups()), [gate]);
  const [neuron, setNeuron] = useState<Neuron2>({ w1: 1, w2: 0, b: -0.2 });
  const right = correctCount(neuron, dots);
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">
          {t(gate ? "line.xorTitle" : "line.title")}
        </h3>
        <p className="mt-1 text-ink-2">{t("line.text")}</p>
      </div>
      <Legend />
      <DotsFigure dots={dots} line={neuron} />
      <NeuronSliders neuron={neuron} onChange={setNeuron} />
      <p
        className={cn(
          "font-medium",
          right === dots.length ? "text-ok" : "text-ink-2"
        )}
      >
        {t("line.score", { right, total: dots.length })}
      </p>
    </Card>
  );
}

function Legend() {
  const t = useTranslations("learning.labs");
  return (
    <div className="type-caption flex flex-wrap gap-4 text-ink-2">
      {([1, 0] as const).map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: GROUP_COLOURS[g] }}
          />
          {t(g ? "line.fire" : "line.quiet")}
        </span>
      ))}
    </div>
  );
}

function XorLab() {
  const t = useTranslations("learning.labs");
  const [x, setX] = useState<[number, number]>([0, 1]);
  const { hidden, out } = xorForward(x[0], x[1]);
  const dots = useMemo(() => gateDots("xor"), []);
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">{t("xor.title")}</h3>
        <p className="mt-1 text-ink-2">{t("xor.text")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PAIRS.map(([a, b]) => (
          <Button
            key={`${a}${b}`}
            size="sm"
            variant={x[0] === a && x[1] === b ? "primary" : "secondary"}
            onClick={() => setX([a, b])}
          >
            {`${a}, ${b}`}
          </Button>
        ))}
      </div>
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <NetworkFigure
          layers={[2, 2, 1]}
          values={[[x[0], x[1]], hidden, [out]]}
          labels={[
            [String(x[0]), String(x[1])],
            [String(hidden[0]), String(hidden[1])],
            [String(out)],
          ]}
        />
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <DotsFigure dots={dots} line={XOR_NET.hidden[0]} />
            <DotsFigure dots={dots} line={XOR_NET.hidden[1]} />
          </div>
          <p className="type-caption text-ink-3">{t("xor.lines")}</p>
        </div>
      </div>
      <p className="font-medium">
        {t("xor.result", { h1: hidden[0], h2: hidden[1], out })}
      </p>
    </Card>
  );
}

const START: Neuron2 = { w1: -1, w2: 1.5, b: 0.2 };

function LearnLab() {
  const t = useTranslations("learning.labs");
  const dots = useMemo(() => twoGroups(), []);
  const [neuron, setNeuron] = useState<Neuron2>(START);
  const [steps, setSteps] = useState(0);
  const learn = (n: number) => {
    let next = neuron;
    for (let i = 0; i < n; i++) next = learnStep(next, dots, 2);
    setNeuron(next);
    setSteps((s) => s + n);
  };
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">{t("learn.title")}</h3>
        <p className="mt-1 text-ink-2">{t("learn.text")}</p>
      </div>
      <Legend />
      <DotsFigure dots={dots} line={neuron} />
      <div className="grid grid-cols-2 gap-2 font-mono text-[14px] tabular-nums sm:grid-cols-5">
        <span>{`w₁ = ${round(neuron.w1)}`}</span>
        <span>{`w₂ = ${round(neuron.w2)}`}</span>
        <span>{`b = ${round(neuron.b)}`}</span>
        <span>{t("learn.error", { e: round(loss(neuron, dots)) })}</span>
        <span>
          {t("line.score", {
            right: correctCount(neuron, dots),
            total: dots.length,
          })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => learn(1)}>
          {t("learn.one")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => learn(20)}>
          {t("learn.twenty")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setNeuron(START);
            setSteps(0);
          }}
        >
          {t("learn.reset")}
        </Button>
        <span className="type-caption self-center text-ink-3">
          {t("learn.steps", { n: steps })}
        </span>
      </div>
    </Card>
  );
}

const HIDDEN = 12;

function DigitsLab() {
  const t = useTranslations("learning.labs");
  const train = useMemo(() => digitSamples(20, 0.08, 5), []);
  const test = useMemo(() => digitSamples(10, 0.08, 99), []);
  const [net, setNet] = useState<Mlp>(() =>
    makeMlp(DIGIT_W * DIGIT_H, HIDDEN, 10, 1)
  );
  const [epochs, setEpochs] = useState(0);
  const [drawing, setDrawing] = useState<number[]>(() => digitPixels(3));
  const { hidden, probs } = forward(net, drawing);
  const best = probs.indexOf(Math.max(...probs));

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="type-subhead">{t("digits.title")}</h3>
        <p className="mt-1 text-ink-2">{t("digits.text")}</p>
      </div>
      <div>
        <p className="type-caption mb-2 text-ink-3">{t("digits.examples")}</p>
        <div className="grid grid-cols-10 gap-2 sm:gap-3">
          {train.slice(0, 20).map((s, i) => (
            <PixelsFigure
              key={i}
              pixels={s.pixels}
              width={DIGIT_W}
              className="max-w-[40px]"
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setNet((n) => trainEpoch(n, train, 0.5));
            setEpochs((e) => e + 1);
          }}
        >
          {t("digits.train")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setNet((n) => {
              let next = n;
              for (let i = 0; i < 10; i++) next = trainEpoch(next, train, 0.5);
              return next;
            });
            setEpochs((e) => e + 10);
          }}
        >
          {t("digits.trainTen")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setNet(makeMlp(DIGIT_W * DIGIT_H, HIDDEN, 10, 1));
            setEpochs(0);
          }}
        >
          {t("learn.reset")}
        </Button>
        <span className="type-caption text-ink-3">
          {t("digits.progress", {
            n: epochs,
            acc: Math.round(accuracy(net, test) * 100),
          })}
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="type-caption mb-2 text-ink-3">{t("digits.draw")}</p>
          <div
            className="grid w-[150px] gap-0.5"
            style={{ gridTemplateColumns: `repeat(${DIGIT_W}, 1fr)` }}
          >
            {drawing.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={t("digits.pixel", { n: i + 1 })}
                aria-pressed={p === 1}
                onClick={() =>
                  setDrawing((d) => d.map((v, k) => (k === i ? 1 - v : v)))
                }
                className={cn(
                  "aspect-square rounded-[3px]",
                  p ? "bg-ink" : "bg-surface-2 hover:bg-surface-3"
                )}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDrawing(Array(DIGIT_W * DIGIT_H).fill(0))}
            >
              {t("digits.clear")}
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Array.from({ length: 10 }, (_, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDrawing(digitPixels(d))}
                className="pressable h-7 w-7 rounded-full bg-surface-2 font-mono text-[12px]"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <p className="type-caption mb-2 text-ink-3">{t("digits.guess")}</p>
            <div className="flex h-24 items-end gap-1.5">
              {probs.map((p, d) => (
                <div
                  key={d}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      "w-full rounded-t",
                      d === best ? "bg-accent" : "bg-surface-3"
                    )}
                    style={{ height: `${Math.max(2, p * 80).toFixed(1)}px` }}
                  />
                  <span
                    className={cn(
                      "font-mono text-[12px]",
                      d === best && "font-bold"
                    )}
                  >
                    {d}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 font-medium">
              {t("digits.verdict", {
                d: best,
                p: Math.round(probs[best] * 100),
              })}
            </p>
          </div>
          <div>
            <p className="type-caption mb-2 text-ink-3">
              {t("digits.hidden", { n: HIDDEN })}
            </p>
            <div className="flex h-10 items-end gap-1">
              {hidden.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(2, h * 40).toFixed(1)}px`,
                    background: GROUP_COLOURS[1],
                    opacity: (0.3 + 0.7 * h).toFixed(2),
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
