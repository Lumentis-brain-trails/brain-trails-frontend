"use client";

/**
 * Your own trail over your own run (T4b): an operator trying a protocol on themselves
 * watches, live, in the top-left corner of the stage, either the trail their EEG draws
 * (2D) or their brain landscape in 3D as the session grows it, with a bright dot where
 * they are now. Two buttons switch between them; the landscape one waits for the first
 * map (about 30 s in, or at once when the person already has one).
 *
 * The page that publishes the run also observes it, through the same live room a carer
 * would (`useLiveRoom`), so the worker analyses it (it draws only what somebody watches).
 * It is opt-in, for self runs only, and never for a patient: a trail on screen during
 * the tasks is a stimulus of its own, so such a session is a try, not a clean recording.
 *
 * The buttons never take the focus: a task answered with the space bar would otherwise
 * press the last one clicked.
 *
 * During a run that trains toward places of the map (V4-0010, `targets`), the landscape
 * is drawn as wells by default (the place the person heads for is a basin they fall
 * into) and the targets are on it; elsewhere hills. Either way the reader can switch,
 * and the choice is remembered for runs of that sort (`useRelief`).
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  LandscapeSurface,
  type SurfaceTargets,
} from "@/components/compare/LandscapeSurface";
import { RELIEFS, type Relief } from "@/lib/brainLandscape";
import { useRelief } from "@/lib/relief";
import { useLiveGround } from "@/lib/live/useLiveGround";
import { useLiveRoom } from "@/lib/live/useLiveRoom";
import { LiveTrail } from "./LiveTrail";

export function SelfTrail({
  sessionId,
  targets = null,
}: {
  sessionId: string;
  /** The run's neurofeedback targets, when a block trains toward places of the map. */
  targets?: SurfaceTargets | null;
}) {
  const t = useTranslations("run.surface");
  const tr = useTranslations("landscape.relief");
  const [relief, setRelief] = useRelief(
    targets ? "run-neurofeedback" : "run",
    targets ? "wells" : "hills"
  );
  const { room } = useLiveRoom(sessionId, true);
  const ground = useLiveGround(sessionId, room, true);
  const [view, setView] = useState<"trail" | "landscape">("trail");
  const shown =
    view === "landscape" && ground.landscape ? "landscape" : "trail";
  const last = ground.x.length - 1;
  const here = last >= 0 ? { x: ground.x[last], y: ground.y[last] } : null;
  // the same arrays until a window moves the dot: the 3D view is redrawn only then
  const trails = useMemo(() => {
    const x = ground.x.slice(-60);
    return [
      {
        x,
        y: ground.y.slice(-60),
        colors: x.map(() => "#ffffff"),
        faint: true,
      },
    ];
  }, [ground.x, ground.y]);

  const pill = (
    pressed: boolean,
    onClick: () => void,
    label: string,
    off = false
  ) => (
    <button
      key={label}
      type="button"
      tabIndex={-1}
      disabled={off}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
        pressed ? "bg-white/90 text-black" : "text-white/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
  const choice = (value: "trail" | "landscape", label: string, off = false) =>
    pill(shown === value, () => setView(value), label, off);
  const reliefChoice = (value: Relief) =>
    pill(relief === value, () => setRelief(value), tr(value));

  return (
    <div
      aria-label={t("selfTrail")}
      className={`pointer-events-none fixed top-4 left-4 z-50 rounded-[var(--radius-card)] bg-white/5 p-2 ${
        shown === "landscape" ? "w-[360px]" : "w-[240px]"
      }`}
    >
      {shown === "landscape" && ground.landscape ? (
        <LandscapeSurface
          landscape={ground.landscape}
          height={260}
          title={t("selfMap")}
          hover={false}
          scheme="dark"
          live
          cursor={here}
          trails={trails}
          relief={relief}
          targets={targets}
        />
      ) : (
        <LiveTrail
          x={room.trail.x}
          y={room.trail.y}
          final={room.trailFinal}
          height={170}
          compact
        />
      )}
      <div
        role="group"
        aria-label={t("selfView")}
        className="pointer-events-auto mt-1 flex justify-end gap-1"
      >
        {shown === "landscape" && (
          <span
            role="group"
            aria-label={tr("label")}
            title={tr("hint")}
            className="mr-auto flex gap-1"
          >
            {RELIEFS.map(reliefChoice)}
          </span>
        )}
        {choice("trail", t("selfViewTrail"))}
        {choice("landscape", t("selfViewLandscape"), !ground.landscape)}
      </div>
      {!ground.landscape && (
        <p className="mt-1 text-[11px] text-white/50">{t("selfMapSoon")}</p>
      )}
    </div>
  );
}
