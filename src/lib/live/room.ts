/**
 * A live room as an observer sees it (T5): what the frames have said so far.
 *
 * A pure reducer over the protocol's frames (`docs/api/live-protocol.md` in the backend),
 * so the remote console's panels read one state and the tests drive it without a socket.
 * The signal itself is not kept here - it goes to `SignalRings`, outside React's state -
 * only its last stream id, so a reconnect resumes where it stopped.
 */

import type { ChannelQuality } from "@/lib/muse/quality";
import type { EegChannel } from "@/lib/muse/protocol";
import type { RunnerState } from "@/lib/protocol/commands";
import type { LiveFrame } from "./socket";

/** The runner's acknowledgement of one command, from its `operator_command` marker. */
export interface Ack {
  effect: string;
  command: string;
}

export interface LiveEvent {
  seq: number;
  label: string;
  tS: number | null;
}

export interface BlockResult {
  stepId: string;
  taskKind: string;
  summary: Record<string, unknown>;
}

export interface PlanStep {
  id: string;
  label: string;
  kind: string;
}

export interface RoomQuality {
  quality: Record<EegChannel, ChannelQuality> | null;
  packets: number;
  lostPackets: number;
  packetRate: number;
  battery: number | null;
  /** The session clock when the producer sent this, and when it arrived here. */
  tSessionS: number | null;
  receivedAt: number;
}

export interface RoomView {
  you: string | null;
  canCommand: boolean;
  commander: string | null;
  observers: number;
  analysed: boolean;
  hasLandscape: boolean;
  pauseOnLostSight: boolean;
  producer: "on" | "lost" | "ended" | null;
  plan: PlanStep[];
  runner: RunnerState | null;
  /** The session's own trail, re-projected whenever a whole frame arrives. */
  trail: { x: number[]; y: number[] };
  /** The windows on the person's landscape. */
  map: { x: number[]; y: number[] };
  trailFinal: boolean;
  events: LiveEvent[];
  results: BlockResult[];
  acks: Record<string, Ack>;
  quality: RoomQuality | null;
  /** The last stream ids seen: `since` on a reconnect. */
  since: { signal?: string; windows?: string };
  error: string | null;
  ended: boolean;
}

/** Events kept for the ticker. */
export const EVENTS_KEPT = 50;

export function emptyRoom(): RoomView {
  return {
    you: null,
    canCommand: false,
    commander: null,
    observers: 0,
    analysed: false,
    hasLandscape: false,
    pauseOnLostSight: false,
    producer: null,
    plan: [],
    runner: null,
    trail: { x: [], y: [] },
    map: { x: [], y: [] },
    trailFinal: false,
    events: [],
    results: [],
    acks: {},
    quality: null,
    since: {},
    error: null,
    ended: false,
  };
}

function planSteps(plan: unknown): PlanStep[] {
  const steps = (plan as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => {
    const step = s as { id?: unknown; label?: unknown; kind?: unknown };
    return {
      id: String(step.id ?? ""),
      label: String(step.label ?? step.id ?? ""),
      kind: String(step.kind ?? ""),
    };
  });
}

/** The room after one more frame. `now` dates a quality frame's arrival. */
export function applyFrame(
  room: RoomView,
  frame: LiveFrame,
  now: number = Date.now()
): RoomView {
  switch (frame.type) {
    case "hello":
      return {
        ...room,
        you: (frame.you as string) ?? null,
        canCommand: frame.command === true,
        commander: (frame.commander as string | null) ?? null,
        observers: Number(frame.observers ?? 0),
        analysed: frame.analysed === true,
        hasLandscape: frame.landscape === true,
        pauseOnLostSight: frame.pause_on_lost_sight === true,
        producer: (frame.producer as RoomView["producer"]) ?? room.producer,
        plan: frame.plan ? planSteps(frame.plan) : room.plan,
        runner: (frame.state as RunnerState | null) ?? room.runner,
        error: null,
      };
    case "chunk":
      return frame.id
        ? { ...room, since: { ...room.since, signal: frame.id } }
        : room;
    case "trail": {
      const points = (frame.points as number[][]) ?? [];
      const map = (frame.map as number[][]) ?? [];
      return {
        ...room,
        analysed: true,
        trail: { x: points.map((p) => p[0]), y: points.map((p) => p[1]) },
        map: map.length
          ? { x: map.map((p) => p[0]), y: map.map((p) => p[1]) }
          : room.map,
        trailFinal: frame.final === true,
        since: { ...room.since, windows: frame.id ?? room.since.windows },
      };
    }
    case "window": {
      const i = Number(frame.i);
      const x = [...room.trail.x];
      const y = [...room.trail.y];
      x[i] = Number(frame.x);
      y[i] = Number(frame.y);
      return {
        ...room,
        analysed: true,
        trail: { x, y },
        since: { ...room.since, windows: frame.id ?? room.since.windows },
      };
    }
    case "place": {
      const i = Number(frame.i);
      const x = [...room.map.x];
      const y = [...room.map.y];
      x[i] = Number(frame.mx);
      y[i] = Number(frame.my);
      return {
        ...room,
        map: { x, y },
        since: { ...room.since, windows: frame.id ?? room.since.windows },
      };
    }
    case "end":
      return {
        ...room,
        ended: true,
        since: { ...room.since, windows: frame.id ?? room.since.windows },
      };
    case "plan":
      return { ...room, plan: planSteps(frame.plan) };
    case "state":
      return { ...room, runner: frame.state as RunnerState };
    case "event": {
      const event = frame.event as {
        kind?: string;
        label?: string;
        seq?: number;
        tSessionS?: number | null;
        meta?: Record<string, unknown>;
        stepId?: string;
        taskKind?: string;
        summary?: Record<string, unknown>;
      };
      if (event?.kind === "block_result")
        return {
          ...room,
          results: [
            ...room.results.filter((r) => r.stepId !== event.stepId),
            {
              stepId: String(event.stepId),
              taskKind: String(event.taskKind),
              summary: event.summary ?? {},
            },
          ],
        };
      const acks =
        event?.label === "operator_command" && event.meta?.command_id
          ? {
              ...room.acks,
              [String(event.meta.command_id)]: {
                effect: String(event.meta.effect ?? "applied"),
                command: String(event.meta.command ?? ""),
              },
            }
          : room.acks;
      return {
        ...room,
        acks,
        events: [
          {
            seq: Number(event?.seq ?? room.events.length),
            label: String(event?.label ?? "?"),
            tS: event?.tSessionS ?? null,
          },
          ...room.events,
        ].slice(0, EVENTS_KEPT),
      };
    }
    case "quality": {
      const q = (frame.quality ?? {}) as Record<string, unknown>;
      return {
        ...room,
        quality: {
          quality: (q.quality as RoomQuality["quality"]) ?? null,
          packets: Number(q.packets ?? 0),
          lostPackets: Number(q.lostPackets ?? 0),
          packetRate: Number(q.packetRate ?? 0),
          battery: typeof q.battery === "number" ? q.battery : null,
          tSessionS: typeof q.tSessionS === "number" ? q.tSessionS : null,
          receivedAt: now,
        },
      };
    }
    case "observers":
      return { ...room, observers: Number(frame.n ?? 0) };
    case "commander":
      return { ...room, commander: (frame.user as string | null) ?? null };
    case "settings":
      return { ...room, pauseOnLostSight: frame.pause_on_lost_sight === true };
    case "room":
      return { ...room, producer: frame.producer as RoomView["producer"] };
    case "error":
      return { ...room, error: String(frame.code ?? "error") };
    default:
      return room;
  }
}

/** Whether this observer holds the commands. */
export function holdsCommands(room: RoomView): boolean {
  return room.canCommand && room.you !== null && room.commander === room.you;
}
