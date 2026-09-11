"use client";

import { type EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality, QualityLevel } from "@/lib/muse/quality";

/**
 * Schematic front view of a head wearing the Muse 2: the band runs across the
 * forehead and behind the ears, and the four electrodes light up with their
 * contact quality. A line drawing, not an illustration, so it reads as an
 * instrument panel and matches the rest of the chrome.
 */
export function HeadbandDiagram({
  quality,
}: {
  quality: Record<EegChannel, ChannelQuality>;
}) {
  const fill = (level: QualityLevel) =>
    level === "good"
      ? "var(--color-ok)"
      : level === "unknown"
        ? "var(--color-ink-3)"
        : level === "flat"
          ? "var(--color-danger)"
          : "var(--color-warn)";
  // Electrode positions in the 240x200 drawing: ear electrodes low and wide,
  // forehead electrodes high and inside the band.
  const sensors: {
    id: EegChannel;
    x: number;
    y: number;
    label: "left" | "right";
  }[] = [
    { id: "TP9", x: 42, y: 118, label: "left" },
    { id: "AF7", x: 84, y: 66, label: "left" },
    { id: "AF8", x: 156, y: 66, label: "right" },
    { id: "TP10", x: 198, y: 118, label: "right" },
  ];
  return (
    <svg
      viewBox="0 0 240 200"
      role="img"
      aria-label={`Headband: ${sensors.map((s) => `${s.id} ${quality[s.id].level}`).join(", ")}`}
      className="h-auto w-full max-w-[260px]"
    >
      {/* head */}
      <ellipse
        cx="120"
        cy="104"
        rx="70"
        ry="86"
        fill="none"
        stroke="var(--color-hairline-strong)"
        strokeWidth="1.5"
      />
      {/* ears */}
      <path
        d="M50 104c-10 0-14 10-12 20s10 14 14 8"
        fill="none"
        stroke="var(--color-hairline-strong)"
        strokeWidth="1.5"
      />
      <path
        d="M190 104c10 0 14 10 12 20s-10 14-14 8"
        fill="none"
        stroke="var(--color-hairline-strong)"
        strokeWidth="1.5"
      />
      {/* band: forehead arc down to behind the ears */}
      <path
        d="M40 122 C 52 60, 188 60, 200 122"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* reference electrode Fpz, always neutral */}
      <circle cx="120" cy="61" r="3" fill="var(--color-ink-3)" opacity="0.6" />
      {sensors.map((s) => (
        <g key={s.id}>
          <circle
            cx={s.x}
            cy={s.y}
            r="9"
            fill={fill(quality[s.id].level)}
            stroke="var(--color-surface)"
            strokeWidth="2.5"
          />
          <text
            x={s.label === "left" ? s.x - 14 : s.x + 14}
            y={s.y + 4}
            textAnchor={s.label === "left" ? "end" : "start"}
            fontSize="12"
            fontWeight="600"
            fill="var(--color-ink)"
          >
            {s.id}
          </text>
        </g>
      ))}
      <text
        x="120"
        y="190"
        textAnchor="middle"
        fontSize="11"
        fill="var(--color-ink-3)"
      >
        front view · wearer&apos;s left is on the left
      </text>
    </svg>
  );
}
