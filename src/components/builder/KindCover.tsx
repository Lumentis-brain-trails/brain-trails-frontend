"use client";

/**
 * The picture of a block: a still frame of what the participant will see.
 *
 * One component draws it at every size - a thumbnail in the bin, a chip on a clip, the
 * monitor's still - so a kind looks the same everywhere. Media with a cover shows its
 * cover. The go/no-go game is painted by the game's own renderer, so its cover is a real
 * frame of the game and changes when the game does. The other kinds are a plain symbol
 * on the participant's dark stage.
 */
import { STAGE_GROUND } from "@/lib/protocol/stage";
import { useEffect, useRef } from "react";
import { paint } from "@/components/protocol/kinds/render";
import { cn } from "@/components/ui";
import { identityOf } from "@/lib/builder/kinds";

const STAGE = STAGE_GROUND;

export function KindCover({
  kind,
  image,
  className,
}: {
  kind: string;
  /** A cover or poster URL; wins over the drawn frame. */
  image?: string | null;
  className?: string;
}) {
  const frame = cn(
    "relative block aspect-video w-full overflow-hidden rounded-[6px]",
    className
  );
  if (image)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
      <img src={image} alt="" className={cn(frame, "object-cover")} />
    );
  if (kind === "go-no-go") return <GameFrame className={frame} />;
  const { tone } = identityOf(kind);
  return (
    <svg
      viewBox="0 0 160 90"
      aria-hidden
      className={frame}
      style={{ background: STAGE, color: tone }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SYMBOLS[kind] ?? SYMBOLS.prompt}
      </g>
    </svg>
  );
}

/** One real frame of the game: cargo half way to the dock, on the star field. */
function GameFrame({ className }: { className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    paint(
      ctx,
      { width: 640, height: 360 },
      {
        phase: "target",
        beacon: null,
        objectClass: "cargo",
        objectProgress: 0.55,
        feedback: null,
        trialIndex: 0,
        totalTrials: 1,
      }
    );
  }, []);
  return (
    <canvas
      ref={canvas}
      width={640}
      height={360}
      aria-hidden
      className={className}
      style={{ background: STAGE }}
    />
  );
}

const SYMBOLS: Record<string, React.ReactNode> = {
  video: <path d="M68 28v34l30-17z" fill="currentColor" />,
  audio: (
    <path d="M50 45v0M60 36v18M70 28v34M80 38v14M90 24v42M100 34v22M110 41v8" />
  ),
  text: <path d="M52 30h56M52 41h56M52 52h56M52 63h34" />,
  "image-sequence": (
    <>
      <rect x="46" y="24" width="52" height="36" rx="4" opacity="0.4" />
      <rect x="62" y="32" width="52" height="36" rx="4" />
    </>
  ),
  breathing: (
    <>
      <circle cx="80" cy="45" r="26" opacity="0.35" />
      <circle cx="80" cy="45" r="14" fill="currentColor" stroke="none" />
    </>
  ),
  flanker: (
    <>
      <path d="M30 45h18M42 39l6 6-6 6M56 45h18M68 39l6 6-6 6" opacity="0.45" />
      <path d="M100 45H82M88 39l-6 6 6 6" strokeWidth="4" />
      <path d="M108 45h18M120 39l6 6-6 6M134 45h-0" opacity="0.45" />
    </>
  ),
  "n-back": (
    <>
      <rect x="34" y="33" width="24" height="24" rx="4" opacity="0.3" />
      <rect x="68" y="33" width="24" height="24" rx="4" opacity="0.55" />
      <rect
        x="102"
        y="33"
        width="24"
        height="24"
        rx="4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M46 66c10 10 58 10 68 0" opacity="0.6" />
    </>
  ),
  coding: (
    <>
      <path d="M44 28h72M44 44h72M44 60h72M68 28v32M92 28v32" opacity="0.45" />
      <path d="M52 36l8-4v8zM76 32h8v8h-8z" />
      <circle cx="104" cy="36" r="4" />
    </>
  ),
  heartbeat: <path d="M28 46h30l8-16 12 32 10-22 6 6h38" />,
  quiz: (
    <>
      <path d="M52 30h56" />
      <rect x="52" y="42" width="24" height="12" rx="3" />
      <rect x="84" y="42" width="24" height="12" rx="3" fill="currentColor" />
      <rect x="52" y="60" width="24" height="12" rx="3" />
      <rect x="84" y="60" width="24" height="12" rx="3" />
    </>
  ),
  baseline: (
    <>
      <path d="M46 45c10-14 22-20 34-20s24 6 34 20c-10 14-22 20-34 20s-24-6-34-20z" />
      <circle cx="80" cy="45" r="9" fill="currentColor" stroke="none" />
    </>
  ),
  rest: <path d="M70 30v30M90 30v30" strokeWidth="6" />,
  fixation: <path d="M80 31v28M66 45h28" />,
  countdown: (
    <text
      x="80"
      y="60"
      textAnchor="middle"
      fontSize="44"
      fontWeight="600"
      fill="currentColor"
      stroke="none"
    >
      3
    </text>
  ),
  questionnaire: (
    <>
      <path d="M44 45h72" opacity="0.4" />
      {[44, 62, 80, 98, 116].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="45"
          r={x === 98 ? 7 : 4}
          fill={x === 98 ? "currentColor" : STAGE}
        />
      ))}
    </>
  ),
  instructions: <path d="M50 34h60M58 45h44M64 56h32" />,
  prompt: <path d="M56 45h48" />,
};
