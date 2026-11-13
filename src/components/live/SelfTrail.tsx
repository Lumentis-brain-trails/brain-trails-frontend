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
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import { useLiveGround } from "@/lib/live/useLiveGround";
import { useLiveRoom } from "@/lib/live/useLiveRoom";
import { LiveTrail } from "./LiveTrail";

export function SelfTrail({ sessionId }: { sessionId: string }) {
  const t = useTranslations("run.surface");
  const { room } = useLiveRoom(sessionId, true);
  const ground = useLiveGround(sessionId, room, true);
  const [view, setView] = useState<"trail" | "landscape">("trail");
  const shown =
    view === "landscape" && ground.landscape ? "landscape" : "trail";
  const last = ground.x.length - 1;
  const here = last >= 0 ? { x: ground.x[last], y: ground.y[last] } : null;

  const choice = (value: "trail" | "landscape", label: string, off = false) => (
    <button
      type="button"
      tabIndex={-1}
      disabled={off}
      aria-pressed={shown === value}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setView(value)}
      className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
        shown === value
          ? "bg-white/90 text-black"
          : "text-white/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

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
          trails={[
            {
              x: ground.x.slice(-60),
              y: ground.y.slice(-60),
              colors: ground.x.slice(-60).map(() => "#ffffff"),
              faint: true,
            },
          ]}
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
        {choice("trail", t("selfViewTrail"))}
        {choice("landscape", t("selfViewLandscape"), !ground.landscape)}
      </div>
      {!ground.landscape && (
        <p className="mt-1 text-[11px] text-white/50">{t("selfMapSoon")}</p>
      )}
    </div>
  );
}
