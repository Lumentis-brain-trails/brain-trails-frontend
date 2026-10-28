"use client";

/**
 * The participant's half of a remote session (T5), for the patient's Play.
 *
 * Before Start: when a carer has opened the assignment's waiting room, join it and send
 * the headband pre-flight (status, model, battery, contact) once a second, so the carer
 * sees what the patient sees. The room is asked about once, when the page opens - never
 * polled (0014). After Start: publish the run to the session's live room - the signal
 * from every headband packet, the plan, the runner's state, every marker (a command's
 * acknowledgement is its `operator_command` marker), each block's result, and the
 * quality once a second - and hand the commands that come back to the runner.
 *
 * Off (`enabled` false, or no `live_url` here) nothing is opened and the run is a plain
 * run. Everything published is a copy: the capture still uploads at finish.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAppConfig } from "@/lib/features";
import { LiveProducer } from "@/lib/live/producer";
import { LiveSocket, type Ticket } from "@/lib/live/socket";
import type { useMuse } from "@/lib/muse/useMuse";
import type { ClockAnchor } from "@/lib/protocol/clock";
import type { CommandPort, RunnerState } from "@/lib/protocol/commands";
import type { Marker } from "@/lib/protocol/marker";
import type { MarkerSink } from "@/lib/protocol/sink";
import type { ProtocolDefinition, TaskResult } from "@/lib/protocol/types";

type Muse = ReturnType<typeof useMuse>;

interface WaitingRoom {
  open: boolean;
  ticket: (Ticket & { expires_in: number }) | null;
}

export interface RemoteRun {
  /** A carer waits in the assignment's room (before Start). */
  carerWaiting: boolean;
  /** Somebody watches the session now. */
  observed: boolean;
  commands: CommandPort | undefined;
  /** The run's sink, mirroring every marker to the room. */
  wrap: (sink: MarkerSink) => MarkerSink;
  onState: (state: RunnerState) => void;
  onStepResult: (result: TaskResult) => void;
  /** The run is over (finished or stopped). */
  end: () => void;
}

export function useRemoteRun({
  enabled,
  assignmentId,
  sessionId,
  muse,
  anchor,
  plan,
}: {
  enabled: boolean;
  assignmentId?: string;
  sessionId: string | null;
  muse: Muse;
  anchor: ClockAnchor | null;
  plan: ProtocolDefinition | null;
}): RemoteRun {
  const config = useAppConfig();
  const baseUrl = config.data?.live_url ?? null;
  const on = enabled && Boolean(baseUrl);
  const [carerWaiting, setCarerWaiting] = useState(false);
  const [observers, setObservers] = useState(0);
  // Made per session; nothing opens until the effect below starts it.
  const producer = useMemo(
    () =>
      on && baseUrl && sessionId
        ? new LiveProducer({
            sessionId,
            baseUrl,
            onPresence: (p) => setObservers(p.observers),
          })
        : null,
    [baseUrl, on, sessionId]
  );
  const museRef = useRef(muse);
  const anchorRef = useRef(anchor);
  useEffect(() => {
    museRef.current = muse;
    anchorRef.current = anchor;
  });

  // Before Start: the waiting room, if a carer opened one.
  useEffect(() => {
    if (!on || !baseUrl || !assignmentId || sessionId) return;
    let socket: LiveSocket | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    void api
      .get<WaitingRoom>(`me/assignments/${assignmentId}/live-room`)
      .then((room) => {
        if (cancelled || !room.open || !room.ticket) return;
        let first = room.ticket as Ticket | null;
        socket = new LiveSocket({
          baseUrl,
          // the first connection uses the ticket that came with the answer
          ticket: async () => {
            if (first) {
              const t = first;
              first = null;
              return t;
            }
            const again = await api.get<WaitingRoom>(
              `me/assignments/${assignmentId}/live-room`
            );
            if (!again.ticket) throw new Error("waiting room closed");
            return again.ticket;
          },
          onFrame: (frame) => {
            if (frame.type === "hello" || frame.type === "carer")
              setCarerWaiting(true);
            if (frame.type === "closed") setCarerWaiting(false);
          },
        });
        socket.start();
        timer = setInterval(() => {
          const m = museRef.current;
          socket?.send({
            type: "preflight",
            preflight: {
              status: m.status,
              model: m.model,
              battery: m.batteryPercent,
              quality: m.quality,
              allGood: m.allGood,
            },
          });
        }, 1000);
      })
      .catch(() => undefined); // no room, or none reachable: a plain run
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      socket?.close();
    };
  }, [assignmentId, baseUrl, on, sessionId]);

  // After Start: the session's room.
  useEffect(() => {
    if (!producer) return;
    const live = producer;
    live.start();
    const off = museRef.current.onEeg((channel, index, samples) =>
      live.pushEeg(channel, index, samples)
    );
    const timer = setInterval(() => {
      const m = museRef.current;
      const timeline = m.readTimeline();
      live.quality({
        quality: m.quality,
        packets: timeline.packets,
        lostPackets: timeline.lostPackets,
        packetRate: m.packetRate,
        battery: m.batteryPercent,
        tSessionS: anchorRef.current?.toSessionS(performance.now()) ?? null,
      });
    }, 1000);
    return () => {
      off();
      clearInterval(timer);
      // disconnect only: the run's `end` is said by the run (`end` below)
      live.close();
    };
  }, [producer]);

  useEffect(() => {
    if (producer && plan) producer.setPlan(plan);
  }, [plan, producer]);

  const wrap = useCallback(
    (sink: MarkerSink): MarkerSink =>
      producer
        ? {
            push(marker: Marker) {
              sink.push(marker);
              producer.marker(marker);
            },
            flush: () => sink.flush(),
            flushBeacon: () => sink.flushBeacon(),
            all: () => sink.all(),
            get pending() {
              return sink.pending;
            },
          }
        : sink,
    [producer]
  );

  return useMemo<RemoteRun>(
    () => ({
      carerWaiting,
      observed: observers > 0,
      commands: producer?.commands,
      wrap,
      onState: (state) => producer?.setState(state),
      onStepResult: (result) =>
        producer?.blockResult({
          stepId: result.stepId,
          taskKind: result.taskKind,
          summary: result.summary,
        }),
      end: () => producer?.end(),
    }),
    [carerWaiting, observers, producer, wrap]
  );
}
