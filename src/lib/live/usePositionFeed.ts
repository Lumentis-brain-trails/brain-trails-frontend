"use client";

/**
 * Where the person is on their own landscape, as a feed a neurofeedback block subscribes
 * to (V4-0010): the run page observes its own session in the live room, as `SelfTrail`
 * does, and hands each window the worker places on the person's map to the block.
 *
 * A window is told once, by its index, whatever the room does with it afterwards (a
 * landscape frame re-sends every window on the grown map; those already told are not
 * told again). The feed object is stable for the page's life, so the runner never
 * re-subscribes a block because a frame arrived.
 */

import { useEffect, useMemo, useRef } from "react";
import type { LandscapePoint } from "@/lib/neurofeedback/landscape";
import type { PositionFeed } from "@/lib/protocol/types";
import { useLiveRoom } from "./useLiveRoom";

export function usePositionFeed(
  sessionId: string | null,
  enabled: boolean
): { feed: PositionFeed; available: boolean } {
  const { room, available } = useLiveRoom(
    sessionId ?? "",
    enabled && Boolean(sessionId)
  );
  const listeners = useRef(new Set<(point: LandscapePoint) => void>());
  const told = useRef(-1);
  const feed = useMemo<PositionFeed>(
    () => ({
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    []
  );

  useEffect(() => {
    told.current = -1;
  }, [sessionId]);

  const { map, hasLandscape, landscape, lagMs } = room;
  useEffect(() => {
    const now = performance.now();
    for (let i = told.current + 1; i < map.x.length; i++) {
      const x = map.x[i];
      const y = map.y[i];
      if (typeof x !== "number" || typeof y !== "number") break; // a hole: wait for it
      told.current = i;
      const point: LandscapePoint = {
        i,
        x,
        y,
        hostMs: now,
        lagMs,
        ownMap: hasLandscape,
        epoch: landscape?.epoch ?? null,
      };
      for (const listener of listeners.current) listener(point);
    }
  }, [map, hasLandscape, landscape, lagMs]);

  return { feed, available };
}
