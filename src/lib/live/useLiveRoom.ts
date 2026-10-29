"use client";

/**
 * A session's live room, as a carer's remote console holds it (T5): the room's state,
 * the signal's rings, the socket's health, and the way to send.
 *
 * The second feed of T1's console panels: same panels, fed by the live service instead
 * of the `BroadcastChannel`. A reconnect asks for a fresh ticket and resumes from the
 * stream ids the room last delivered (`since`), so nothing is shown twice or missed.
 * Commands are tracked until the runner acknowledges them (its `operator_command`
 * marker comes back as an event); one with no answer after `ACK_TIMEOUT_MS` is said
 * to be unanswered rather than silently assumed. A carer who held the commands when the
 * socket dropped takes them back on the reconnect, unless they had let go.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { useAppConfig } from "@/lib/features";
import { type CommandType, makeCommand } from "@/lib/protocol/commands";
import { type RoomView, applyFrame, emptyRoom } from "./room";
import { SignalRings } from "./rings";
import {
  type LiveFrame,
  LiveSocket,
  type SocketState,
  type Ticket,
} from "./socket";

/** How long a command may wait for the runner's acknowledgement. */
export const ACK_TIMEOUT_MS = 5000;

export interface SentCommand {
  id: string;
  type: CommandType;
  at: number;
}

export function useLiveRoom(sessionId: string, enabled = true) {
  const config = useAppConfig();
  const baseUrl = config.data?.live_url ?? null;
  const [room, dispatch] = useReducer(
    (state: RoomView, frame: LiveFrame) => applyFrame(state, frame),
    undefined,
    emptyRoom
  );
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [sent, setSent] = useState<SentCommand[]>([]);
  const rings = useMemo(() => new SignalRings(), []);
  const roomRef = useRef(room);
  const socketRef = useRef<LiveSocket | null>(null);
  // held the commands, and did not let go: take them back after a reconnect
  const wantControlRef = useRef(false);
  useEffect(() => {
    roomRef.current = room;
    if (room.you !== null && room.commander === room.you)
      wantControlRef.current = true;
  });

  useEffect(() => {
    if (!enabled || !baseUrl) return;
    const socket = new LiveSocket({
      baseUrl,
      ticket: () =>
        api.post<Ticket>(`sessions/${sessionId}/live/observer-ticket`, {}),
      hello: () => ({ since: roomRef.current.since }),
      onFrame: (frame) => {
        if (frame.type === "chunk" && Array.isArray(frame.eeg))
          rings.push(frame.eeg as number[][]);
        dispatch(frame);
        if (
          frame.type === "hello" &&
          wantControlRef.current &&
          frame.command === true &&
          frame.commander !== frame.you
        )
          socketRef.current?.send({ type: "take_command" });
      },
      onState: setSocketState,
    });
    socketRef.current = socket;
    socket.start();
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [baseUrl, enabled, rings, sessionId]);

  const send = useCallback((frame: LiveFrame) => {
    if (frame.type === "release_command") wantControlRef.current = false;
    return socketRef.current?.send(frame) ?? false;
  }, []);

  const sendCommand = useCallback(
    (type: CommandType, text?: string) => {
      const command = makeCommand(type, text, "remote");
      if (send({ type: "command", command }))
        setSent((list) => [
          ...list.slice(-19),
          { id: command.id, type, at: Date.now() },
        ]);
    },
    [send]
  );

  // what the last command came to: acknowledged, still waiting, or unanswered
  const [now, setNow] = useState(() => Date.now());
  const last = sent.at(-1) ?? null;
  const lastAck = last ? (room.acks[last.id] ?? null) : null;
  useEffect(() => {
    if (!last || lastAck) return;
    const timer = setTimeout(() => setNow(Date.now()), ACK_TIMEOUT_MS + 50);
    return () => clearTimeout(timer);
  }, [last, lastAck]);
  const lastCommand = last
    ? {
        ...last,
        status: lastAck
          ? lastAck.effect
          : now - last.at > ACK_TIMEOUT_MS
            ? "timeout"
            : "pending",
      }
    : null;

  /** Seconds on the session clock now, from the producer's last quality frame. */
  const clock = useCallback(() => {
    const q = roomRef.current.quality;
    if (!q || q.tSessionS === null) return null;
    return q.tSessionS + (Date.now() - q.receivedAt) / 1000;
  }, []);

  return {
    available: Boolean(baseUrl),
    room,
    socketState,
    rings,
    send,
    sendCommand,
    lastCommand,
    clock,
  };
}
