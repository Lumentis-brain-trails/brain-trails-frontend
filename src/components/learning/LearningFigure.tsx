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
