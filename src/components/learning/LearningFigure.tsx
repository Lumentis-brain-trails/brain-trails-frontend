"use client";

/**
 * Draws a Learning figure from its spec (`FigureSpec`): a point on a line, a point on a
 * plane, a signal made of bells, waves and beats, or the autoencoder's diagram.
 *
 * Everything is an inline SVG computed from the spec's numbers, so the picture a
 * question shows is exactly the code it asks about, it scales to any screen, and it
 * follows the light and dark themes through `currentColor` and the design tokens.
 */
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cn } from "@/components/ui";
import type { FigureSpec } from "@/lib/learning/questions";
import { type Part, sample } from "@/lib/learning/signals";

/** The colours of a signal's parts, one per part in turn (the heartbeat has eight). */
export const PART_COLOURS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#a3a329",
];

const W = 300;
const H = 170;
const PAD = 14;

export function LearningFigure({
  spec,
  className,
  colours,
}: {
  spec: FigureSpec;
  className?: string;
  /** A colour per part when `showParts` is on; defaults to `PART_COLOURS`. */
  colours?: string[];
}) {
  switch (spec.kind) {
    case "line":
      return <LineFigure x={spec.x} range={spec.range} className={className} />;
    case "plane":
      return (
        <PlaneFigure
          x={spec.x}
          y={spec.y}
          range={spec.range}
          className={className}
        />
      );
    case "signal":
      return (
        <SignalFigure spec={spec} className={className} colours={colours} />
      );
    case "vae":
      return <VaeFigure latent={spec.latent} className={className} />;
    case "dots":
      return (
        <DotsFigure dots={spec.dots} line={spec.line} className={className} />
      );
    case "network":
      return <NetworkFigure layers={spec.layers} className={className} />;
    case "pixels":
      return (
        <PixelsFigure
          pixels={spec.pixels}
          width={spec.width}
          className={className}
        />
      );
    case "neuron":
      return <NeuronFigure className={className} />;
    case "lifespan":
      return <LifespanFigure className={className} />;
  }
}

function LineFigure({
  x,
  range = [0, 10],
  className,
}: {
  x: number;
  range?: [number, number];
  className?: string;
}) {
  const h = 64;
  const sx = (v: number) =>
    PAD + ((v - range[0]) / (range[1] - range[0])) * (W - 2 * PAD);
  const ticks = [];
  for (let v = Math.ceil(range[0]); v <= range[1]; v++) ticks.push(v);
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      className={cn("w-full text-ink", className)}
      role="img"
    >
      <line
        x1={sx(range[0])}
        x2={sx(range[1])}
        y1={30}
        y2={30}
        stroke="currentColor"
        strokeWidth={1.5}
      />
      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={sx(v)}
            x2={sx(v)}
            y1={25}
            y2={35}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.6}
          />
          <text
            x={sx(v)}
            y={50}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            opacity={0.6}
          >
            {v}
          </text>
        </g>
      ))}
      <circle cx={sx(x)} cy={30} r={6} fill={PART_COLOURS[0]} />
    </svg>
  );
}

function PlaneFigure({
  x,
  y,
  range = [0, 10],
  className,
}: {
  x: number;
  y: number;
  range?: [number, number];
  className?: string;
}) {
  const size = 180;
  const pad = 22;
  const s = (v: number) =>
    ((v - range[0]) / (range[1] - range[0])) * (size - pad - 8);
  const lines = [];
  for (let v = Math.ceil(range[0]); v <= range[1]; v++) lines.push(v);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("mx-auto w-full max-w-[220px] text-ink", className)}
      role="img"
    >
      {lines.map((v) => (
        <g key={v} opacity={v === range[0] ? 0.9 : 0.15}>
          <line
            x1={pad + s(v)}
            x2={pad + s(v)}
            y1={8}
            y2={size - pad}
            stroke="currentColor"
          />
          <line
            x1={pad}
            x2={size - 8}
            y1={size - pad - s(v)}
            y2={size - pad - s(v)}
            stroke="currentColor"
          />
        </g>
      ))}
      {lines
        .filter((v) => v % 2 === 0)
        .map((v) => (
          <g key={v} fontSize={9} fill="currentColor" opacity={0.6}>
            <text x={pad + s(v)} y={size - 8} textAnchor="middle">
              {v}
            </text>
            <text x={pad - 6} y={size - pad - s(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
      <circle
        cx={pad + s(x)}
        cy={size - pad - s(y)}
        r={6}
        fill={PART_COLOURS[0]}
      />
    </svg>
  );
}

/** A path through `n` samples of `parts`, in the figure's pixel space. */
function pathOf(
  parts: Part[],
  domain: [number, number],
  yRange: [number, number],
  n = 400
): string {
  const { x, y } = sample(parts, domain, n);
  const sx = (v: number) =>
    PAD + ((v - domain[0]) / (domain[1] - domain[0])) * (W - 2 * PAD);
  const sy = (v: number) =>
    H - PAD - ((v - yRange[0]) / (yRange[1] - yRange[0])) * (H - 2 * PAD);
  return x
    .map(
      (xi, i) =>
        `${i ? "L" : "M"}${sx(xi).toFixed(1)},${sy(
          Math.min(Math.max(y[i], yRange[0] - 1), yRange[1] + 1)
        ).toFixed(1)}`
    )
    .join("");
}

function SignalFigure({
  spec,
  className,
  colours = PART_COLOURS,
}: {
  spec: Extract<FigureSpec, { kind: "signal" }>;
  className?: string;
  colours?: string[];
}) {
  const clip = useId();
  const { domain, yRange } = spec;
  const sx = (v: number) =>
    PAD + ((v - domain[0]) / (domain[1] - domain[0])) * (W - 2 * PAD);
  const zero =
    H - PAD - ((0 - yRange[0]) / (yRange[1] - yRange[0])) * (H - 2 * PAD);
  const ticks: number[] = [];
  if (spec.ticks) {
    const step = domain[1] - domain[0] > 4 ? 1 : 0.5;
    for (let v = domain[0]; v <= domain[1] + 1e-9; v += step) ticks.push(v);
  }
  const hasEeg = spec.parts.some((p) => p.type === "eeg");
  return (
    <svg
      viewBox={`0 0 ${W} ${H + (spec.ticks ? 14 : 0)}`}
      className={cn("w-full text-ink", className)}
      role="img"
    >
      <clipPath id={clip}>
        <rect x={0} y={PAD - 6} width={W} height={H - 2 * PAD + 12} />
      </clipPath>
      {yRange[0] < 0 && yRange[1] > 0 && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={zero}
          y2={zero}
          stroke="currentColor"
          opacity={0.25}
        />
      )}
      {ticks.map((v) => (
        <g key={v} fill="currentColor" stroke="currentColor" opacity={0.5}>
          <line x1={sx(v)} x2={sx(v)} y1={H - PAD + 2} y2={H - PAD + 6} />
          <text
            x={sx(v)}
            y={H + 6}
            textAnchor="middle"
            fontSize={9}
            stroke="none"
          >
            {Math.round(v * 10) / 10}
          </text>
        </g>
      ))}
      <g clipPath={`url(#${clip})`} fill="none" strokeLinejoin="round">
        {spec.ghost && (
          <path
            d={pathOf(spec.ghost, domain, yRange)}
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.35}
          />
        )}
        {spec.showParts &&
          spec.parts.map((part, i) => (
            <path
              key={i}
              d={pathOf([part], domain, yRange)}
              stroke={colours[i % colours.length]}
              strokeWidth={1.6}
              opacity={0.85}
            />
          ))}
        <path
          d={pathOf(spec.parts, domain, yRange, hasEeg ? 800 : 400)}
          stroke="currentColor"
          strokeWidth={spec.showParts ? 1.4 : 2.2}
          opacity={spec.showParts ? 0.55 : 1}
        />
      </g>
    </svg>
  );
}

/**
 * The variational autoencoder, drawn as the module explains it: a signal goes into the
 * encoder, comes out as a few numbers - each a small bell, a mean and a spread - and the
 * decoder draws a signal back from a value picked in each bell.
 */
function VaeFigure({
  latent,
  className,
}: {
  latent: number;
  className?: string;
}) {
  const t = useTranslations("learning.figure");
  const w = 420;
  const h = 200;
  const mid = h / 2;
  const trace = (x0: number, seed: number) => {
    const { y } = sample([{ type: "eeg", seed }], [0, 1.5], 60);
    return y
      .map(
        (v, i) =>
          `${i ? "L" : "M"}${(x0 + i * 1.1).toFixed(1)},${(mid + v * 22).toFixed(1)}`
      )
      .join("");
  };
  const gap = Math.min(18, 150 / latent);
  const top = mid - ((latent - 1) * gap) / 2;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("w-full text-ink", className)}
      role="img"
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.4}>
        <path d={trace(6, 7)} />
        <path d={trace(w - 72, 7)} opacity={0.75} />
      </g>
      <path
        d={`M86,${mid - 70} L166,${mid - 24} L166,${mid + 24} L86,${mid + 70} Z`}
        fill={PART_COLOURS[0]}
        opacity={0.22}
        stroke={PART_COLOURS[0]}
      />
      <path
        d={`M${w - 166},${mid - 24} L${w - 86},${mid - 70} L${w - 86},${
          mid + 70
        } L${w - 166},${mid + 24} Z`}
        fill={PART_COLOURS[1]}
        opacity={0.22}
        stroke={PART_COLOURS[1]}
      />
      <g fontSize={12} fill="currentColor" textAnchor="middle">
        <text x={126} y={mid + 4}>
          {t("encoder")}
        </text>
        <text x={w - 126} y={mid + 4}>
          {t("decoder")}
        </text>
        <text x={w / 2} y={h - 4} opacity={0.7}>
          {t("latent")}
        </text>
        <text x={40} y={h - 4} opacity={0.7}>
          {t("input")}
        </text>
        <text x={w - 40} y={h - 4} opacity={0.7}>
          {t("output")}
        </text>
      </g>
      {Array.from({ length: latent }, (_, i) => {
        const cy = top + i * gap;
        const sigma = 3 + ((i * 7) % 5);
        const bump = Array.from({ length: 21 }, (_, k) => {
          const dx = k - 10;
          return `${k ? "L" : "M"}${w / 2 - 20 + k * 2},${(
            cy -
            6 * Math.exp((-0.5 * dx * dx) / ((sigma * sigma) / 4))
          ).toFixed(1)}`;
        }).join("");
        return (
          <g key={i}>
            <path
              d={bump}
              fill="none"
              stroke={PART_COLOURS[2]}
              strokeWidth={1.4}
            />
            <circle
              cx={w / 2 - 8 + ((i * 5) % 16)}
              cy={cy}
              r={2.2}
              fill="currentColor"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** The two groups' colours: blue for 1, amber for 0 (the comparison view's pair). */
export const GROUP_COLOURS = ["#f59e0b", "#3b82f6"] as const;

/**
 * Dots on the unit square (a little margin around it), coloured by group, and the line
 * where a neuron's weighted sum is zero, with the side where it fires shaded.
 */
export function DotsFigure({
  dots,
  line,
  className,
}: {
  dots: { x: number; y: number; label: 0 | 1 }[];
  line?: { w1: number; w2: number; b: number };
  className?: string;
}) {
  const size = 200;
  const lo = -0.3;
  const hi = 1.3;
  const s = (v: number) => ((v - lo) / (hi - lo)) * size;
  // the line's ends on the square's border, and the shaded half-plane where it fires
  let lineEnds: [number, number, number, number] | null = null;
  let shade = "";
  if (line && (line.w1 !== 0 || line.w2 !== 0)) {
    const pts: [number, number][] = [];
    const corners: [number, number][] = [
      [lo, lo],
      [hi, lo],
      [hi, hi],
      [lo, hi],
    ];
    const f = (x: number, y: number) => line.w1 * x + line.w2 * y + line.b;
    const poly: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const fa = f(a[0], a[1]);
      const fb = f(b[0], b[1]);
      if (fa > 0) poly.push(a);
      if (fa > 0 !== fb > 0) {
        const t = fa / (fa - fb);
        const p: [number, number] = [
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
        ];
        pts.push(p);
        poly.push(p);
      }
    }
    if (pts.length === 2)
      lineEnds = [
        s(pts[0][0]),
        size - s(pts[0][1]),
        s(pts[1][0]),
        size - s(pts[1][1]),
      ];
    shade = poly
      .map(([x, y], i) => `${i ? "L" : "M"}${s(x)},${size - s(y)}`)
      .join("");
    if (shade) shade += "Z";
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("mx-auto w-full max-w-[320px] text-ink", className)}
      role="img"
    >
      <rect
        x={s(0)}
        y={size - s(1)}
        width={s(1) - s(0)}
        height={s(1) - s(0)}
        fill="none"
        stroke="currentColor"
        opacity={0.15}
      />
      {shade && <path d={shade} fill={GROUP_COLOURS[1]} opacity={0.1} />}
      {lineEnds && (
        <line
          x1={lineEnds[0]}
          y1={lineEnds[1]}
          x2={lineEnds[2]}
          y2={lineEnds[3]}
          stroke="currentColor"
          strokeWidth={2}
        />
      )}
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={s(d.x)}
          cy={size - s(d.y)}
          r={5}
          fill={GROUP_COLOURS[d.label]}
          stroke="var(--surface)"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}

/**
 * A fully connected network: a column of circles per layer, every circle wired to every
 * circle of the next. Big layers are drawn with at most twelve circles and a gap, so a
 * 35-pixel input still fits; `values` (0 to 1, per layer) fill the circles.
 */
export function NetworkFigure({
  layers,
  values,
  labels,
  className,
}: {
  layers: number[];
  values?: number[][];
  labels?: string[][];
  className?: string;
}) {
  const w = 320;
  const h = 200;
  const MAX = 12;
  const xs = layers.map((_, i) => 30 + (i * (w - 60)) / (layers.length - 1));
  const shown = layers.map((n) => Math.min(n, MAX));
  const ys = shown.map((n) =>
    Array.from({ length: n }, (_, k) =>
      n === 1 ? h / 2 : 18 + (k * (h - 36)) / (n - 1)
    )
  );
  const r = Math.min(12, (h - 36) / (Math.max(...shown) * 2.4));
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("mx-auto w-full max-w-[420px] text-ink", className)}
      role="img"
    >
      <g stroke="currentColor" opacity={0.18}>
        {ys
          .slice(1)
          .map((col, i) =>
            col.flatMap((y2, b) =>
              ys[i].map((y1, a) => (
                <line
                  key={`${i}-${a}-${b}`}
                  x1={xs[i]}
                  y1={y1}
                  x2={xs[i + 1]}
                  y2={y2}
                />
              ))
            )
          )}
      </g>
      {ys.map((col, i) =>
        col.map((y, k) => {
          const v = values?.[i]?.[k];
          return (
            <g key={`${i}-${k}`}>
              <circle
                cx={xs[i]}
                cy={y}
                r={r}
                fill={
                  v === undefined
                    ? "var(--surface)"
                    : `color-mix(in srgb, ${GROUP_COLOURS[1]} ${Math.round(
                        v * 100
                      )}%, var(--surface))`
                }
                stroke="currentColor"
                strokeWidth={1.2}
              />
              {labels?.[i]?.[k] && (
                <text
                  x={xs[i]}
                  y={y + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                >
                  {labels[i][k]}
                </text>
              )}
            </g>
          );
        })
      )}
      {layers.map((n, i) =>
        n > MAX ? (
          <text
            key={i}
            x={xs[i]}
            y={h - 2}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            opacity={0.6}
          >
            {n}
          </text>
        ) : null
      )}
    </svg>
  );
}

/** A small picture of square pixels: a digit, or the class's own drawing. */
export function PixelsFigure({
  pixels,
  width,
  className,
}: {
  pixels: number[];
  width: number;
  className?: string;
}) {
  const rows = Math.ceil(pixels.length / width);
  return (
    <svg
      viewBox={`0 0 ${width} ${rows}`}
      className={cn("mx-auto w-full max-w-[90px] text-ink", className)}
      role="img"
      shapeRendering="crispEdges"
    >
      <rect width={width} height={rows} fill="var(--surface-2)" />
      {pixels.map((p, i) =>
        p ? (
          <rect
            key={i}
            x={i % width}
            y={Math.floor(i / width)}
            width={1}
            height={1}
            fill="currentColor"
            opacity={Math.min(1, p)}
          />
        ) : null
      )}
    </svg>
  );
}

/**
 * One artificial neuron with its parts named: two inputs, their weights on the wires,
 * the sum in the body, and the output that fires past the threshold.
 */
function NeuronFigure({ className }: { className?: string }) {
  const t = useTranslations("learning.figure");
  return (
    <svg
      viewBox="0 0 360 170"
      className={cn("mx-auto w-full max-w-[520px] text-ink", className)}
      role="img"
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.6}>
        <line x1={46} y1={45} x2={160} y2={80} />
        <line x1={46} y1={125} x2={160} y2={90} />
        <line x1={210} y1={85} x2={300} y2={85} />
        <path d="M296,79 L306,85 L296,91" />
        <circle cx={185} cy={85} r={27} fill="var(--surface)" />
      </g>
      <circle cx={36} cy={45} r={10} fill={PART_COLOURS[0]} />
      <circle cx={36} cy={125} r={10} fill={PART_COLOURS[0]} />
      <g fontSize={12} fill="currentColor" textAnchor="middle">
        <text x={36} y={20}>
          {t("inputs")}
        </text>
        <text x={100} y={50} fill={PART_COLOURS[1]}>
          {"w₁"}
        </text>
        <text x={100} y={128} fill={PART_COLOURS[1]}>
          {"w₂"}
        </text>
        <text x={100} y={160} fill={PART_COLOURS[1]}>
          {t("weights")}
        </text>
        <text x={185} y={90} fontSize={18}>
          Σ
        </text>
        <text x={185} y={135}>
          {t("sum")}
        </text>
        <text x={320} y={70}>
          {t("fires")}
        </text>
      </g>
    </svg>
  );
}

/** Ages on the lifespan figure's axis: stretched early, where most happens. */
const AGES = [0, 2, 6, 12, 20, 40, 60, 90];
const ageX = (age: number) => 30 + Math.sqrt(age / 90) * 260;

/**
 * Plasticity over a lifetime, schematic: the number of synapses (rising fast to a peak
 * around two years, then pruned through childhood and adolescence, then slowly falling;
 * after Huttenlocher's counts in the frontal cortex), and how easily connections change
 * (highest at birth, falling, but never zero).
 */
function LifespanFigure({ className }: { className?: string }) {
  const t = useTranslations("learning.figure");
  const synapses = (a: number) =>
    a < 2
      ? 0.35 + 0.65 * Math.sin((a / 2) * (Math.PI / 2))
      : 0.62 + 0.38 * Math.exp(-(a - 2) / 6) - a * 0.0015;
  const ease = (a: number) => 0.25 + 0.7 * Math.exp(-a / 7) - a * 0.0008;
  const path = (f: (a: number) => number) =>
    Array.from({ length: 181 }, (_, i) => {
      const a = (i / 180) * 90;
      return `${i ? "L" : "M"}${ageX(a).toFixed(1)},${(150 - f(a) * 120).toFixed(1)}`;
    }).join("");
  return (
    <svg
      viewBox="0 0 310 185"
      className={cn("mx-auto w-full max-w-[640px] text-ink", className)}
      role="img"
    >
      <line
        x1={30}
        x2={295}
        y1={150}
        y2={150}
        stroke="currentColor"
        opacity={0.4}
      />
      {AGES.map((a) => (
        <g key={a} fill="currentColor" opacity={0.6}>
          <line
            x1={ageX(a)}
            x2={ageX(a)}
            y1={150}
            y2={154}
            stroke="currentColor"
          />
          <text x={ageX(a)} y={164} fontSize={8} textAnchor="middle">
            {a}
          </text>
        </g>
      ))}
      <text
        x={162}
        y={180}
        fontSize={8}
        textAnchor="middle"
        fill="currentColor"
        opacity={0.6}
      >
        {t("age")}
      </text>
      <path
        d={path(synapses)}
        fill="none"
        stroke={PART_COLOURS[0]}
        strokeWidth={2}
      />
      <path
        d={path(ease)}
        fill="none"
        stroke={PART_COLOURS[1]}
        strokeWidth={2}
      />
      <g fontSize={9}>
        <circle cx={150} cy={14} r={3} fill={PART_COLOURS[0]} />
        <text x={156} y={17} fill="currentColor">
          {t("synapses")}
        </text>
        <circle cx={150} cy={28} r={3} fill={PART_COLOURS[1]} />
        <text x={156} y={31} fill="currentColor">
          {t("ease")}
        </text>
      </g>
    </svg>
  );
}
