/**
 * Self-Assessment Manikin figures (Bradley & Lang, 1994), drawn as simple SVG.
 *
 * The instrument is graphic on purpose: the figures carry the scale's meaning across
 * languages and reading levels, which is why SAM is used with children and in
 * cross-cultural studies. Five figures sit over the 9 points (at 1, 3, 5, 7, 9):
 * valence changes the mouth, arousal the burst in the body, dominance the figure's size.
 */

import type { SAM_DIMENSIONS } from "@/lib/protocol/blocks";

export type SamDimension = (typeof SAM_DIMENSIONS)[number];

/** `level` is 0..4, left (unhappy, calm, controlled) to right. */
export function SamManikin({
  dimension,
  level,
}: {
  dimension: SamDimension;
  level: number;
}) {
  const scale = dimension === "dominance" ? 0.55 + level * 0.1125 : 1;
  const curve = dimension === "valence" ? (level - 2) * 2.5 : 0;
  const burst = dimension === "arousal" ? 2 + level * 3.5 : 0;
  const points = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? burst : burst * 0.45;
    const a = (i / 16) * Math.PI * 2;
    return `${30 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 60 80"
      aria-hidden="true"
      className="h-14 w-11 text-ink-2"
    >
      <g
        transform={`translate(30 78) scale(${scale}) translate(-30 -78)`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="30" cy="18" r="12" />
        <circle cx="25.5" cy="15" r="1.2" fill="currentColor" />
        <circle cx="34.5" cy="15" r="1.2" fill="currentColor" />
        <path d={`M24 23 Q30 ${23 + curve} 36 23`} />
        <path d="M18 34 Q30 30 42 34 L44 66 Q30 70 16 66 Z" />
        <path d="M18 38 L8 54 M42 38 L52 54 M24 67 L22 78 M36 67 L38 78" />
        {burst > 0 && (
          <polygon points={points} fill="currentColor" stroke="none" />
        )}
      </g>
    </svg>
  );
}
