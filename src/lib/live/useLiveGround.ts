"use client";

/**
 * The landscape a live view draws, and where the session is on it (T4b).
 *
 * The map the session grows (`room.landscape`, every 30 windows) wins; until the first
 * one arrives, the person's stored map, when they have one. The session's windows on it
 * come one by one, unsmoothed; they are drawn as the live trail is, each the mean of the
 * last `MAP_SMOOTH` windows, so the dot moves the way the trail does.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { BrainLandscape } from "@/lib/brainLandscape";
import type { RoomView } from "./room";
import { trailingMean } from "./smoothPath";

/** Windows averaged per point on the map: the live trail's 4 s at a 1 s step. */
export const MAP_SMOOTH = 4;

export interface LiveGround {
  landscape: BrainLandscape | null;
  /** True when the map is the one this session grew, not the stored one. */
  growing: boolean;
  x: number[];
  y: number[];
}

export function useLiveGround(
  sessionId: string,
  room: RoomView,
  enabled: boolean
): LiveGround {
  const stored = useQuery({
    queryKey: ["live-landscape", sessionId],
    queryFn: () =>
      api.get<BrainLandscape>(`sessions/${sessionId}/live/landscape`),
    enabled: enabled && room.hasLandscape && room.landscape === null,
    retry: false,
    staleTime: Infinity,
  });
  const x = useMemo(() => trailingMean(room.map.x, MAP_SMOOTH), [room.map.x]);
  const y = useMemo(() => trailingMean(room.map.y, MAP_SMOOTH), [room.map.y]);
  const landscape =
    room.landscape ?? (room.hasLandscape ? (stored.data ?? null) : null);
  return { landscape, growing: room.landscape !== null, x, y };
}
