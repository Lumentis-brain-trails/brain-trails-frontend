"use client";

/**
 * Your own trail over your own run (T4b): an operator trying a protocol on themselves
 * watches the trail their EEG draws, live, in the top-left corner of the stage, and below
 * it where they are on their brain landscape, the map growing with the session.
 *
 * The page that publishes the run also observes it, through the same live room a carer
 * would (`useLiveRoom`), so the worker analyses it (it draws only what somebody watches).
 * It is opt-in, for self runs only, and never for a patient: a trail on screen during
 * the tasks is a stimulus of its own, so such a session is a try, not a clean recording.
 */

import { useTranslations } from "next-intl";
import { useLiveGround } from "@/lib/live/useLiveGround";
import { useLiveRoom } from "@/lib/live/useLiveRoom";
import { LandscapeMini } from "./LandscapeMini";
import { LiveTrail } from "./LiveTrail";

export function SelfTrail({ sessionId }: { sessionId: string }) {
  const t = useTranslations("run.surface");
  const { room } = useLiveRoom(sessionId, true);
  const ground = useLiveGround(sessionId, room, true);
  return (
    <div
      aria-label={t("selfTrail")}
      className="pointer-events-none fixed top-4 left-4 z-50 w-[240px] space-y-2 rounded-[var(--radius-card)] bg-white/5 p-2"
    >
      <LiveTrail
        x={room.trail.x}
        y={room.trail.y}
        final={room.trailFinal}
        height={170}
        compact
      />
      {ground.landscape && (
        <LandscapeMini
          landscape={ground.landscape}
          x={ground.x}
          y={ground.y}
          label={t("selfMap")}
        />
      )}
    </div>
  );
}
