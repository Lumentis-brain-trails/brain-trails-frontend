"use client";

/**
 * The class game's two ends: the teacher's screen (`useHostGame`) and a student's
 * (`usePlayerGame`), over the live service's socket (`LiveSocket`: a fresh ticket per
 * connection, backoff on a drop, straight to `GET /config` `live_url`).
 *
 * Module code launches a question with `useHostGame(school).ask(question)`: any
 * multiple-choice `Question` of `src/lib/learning/` will do. The host keeps the asked
 * question's answer here and sends it only at `reveal`.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAppConfig, useFeature } from "@/lib/features";
import {
  type LiveFrame,
  LiveSocket,
  type SocketState,
  type Ticket,
  TicketRefused,
} from "@/lib/live/socket";
import { MODULES } from "@/lib/learning/modules";
import {
  type ChoiceQuestion,
  type GameView,
  type WireQuestion,
  applyGameFrame,
  emptyGame,
  liveQuestions,
  toWire,
} from "./game";

/** `GET /schools/me/game`. */
export interface MyGame {
  open: boolean;
  school_name: string | null;
  ticket: (Ticket & { expires_in: number; protocol: number }) | null;
}

/** How often a student's app asks whether their class has a game open. */
export const GAME_POLL_MS = 20_000;

function useGameSocket(
  ticket: (() => Promise<Ticket>) | null,
  enabled: boolean
) {
  const config = useAppConfig();
  const baseUrl = config.data?.live_url ?? null;
  const [view, dispatch] = useReducer(
    (state: GameView, frame: LiveFrame) => applyGameFrame(state, frame),
    emptyGame
  );
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [closeCode, setCloseCode] = useState<number | undefined>();
  const socketRef = useRef<LiveSocket | null>(null);
  const ticketRef = useRef(ticket);
  useEffect(() => {
    ticketRef.current = ticket;
  });

  useEffect(() => {
    if (!enabled || !baseUrl || !ticketRef.current) return;
    const socket = new LiveSocket({
      baseUrl,
      ticket: () => {
        const get = ticketRef.current;
        if (!get) throw new TicketRefused();
        return get();
      },
      onFrame: dispatch,
      onState: (state, code) => {
        setSocketState(state);
        setCloseCode(code);
      },
    });
    socketRef.current = socket;
    socket.start();
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [enabled, baseUrl]);

  const send = useCallback(
    (frame: LiveFrame) => socketRef.current?.send(frame) ?? false,
    []
  );
  return { view, socketState, closeCode, send, available: !!baseUrl };
}

/**
 * The teacher's end of their school's game: opens it (or rejoins it) and drives it.
 * `enabled` false keeps the socket shut (no game until the teacher starts one).
 */
export function useHostGame(
  schoolId: string,
  enabled: boolean,
  plan: string | null = null
) {
  const answers = useRef(new Map<string, string>());
  const game = useGameSocket(
    () => api.post<Ticket>(`schools/${schoolId}/game`, plan ? { plan } : {}),
    enabled
  );
  const { send } = game;

  /** Put `question` in front of the class; voting opens at once. */
  const ask = useCallback(
    (question: ChoiceQuestion) => {
      answers.current.set(question.id, question.answer);
      return send({ type: "question", question: toWire(question) });
    },
    [send]
  );
  /**
   * Put any round in front of the class: a `WireQuestion` the caller built (a step on
   * the braided path: `kind: "braid"`, the edges as `options` and `buttons`). Voting
   * opens at once; the caller decides when it ends (`close`, then `reveal(winner)`).
   */
  const askRound = useCallback(
    (round: WireQuestion) => send({ type: "question", question: round }),
    [send]
  );
  const close = useCallback(() => send({ type: "close" }), [send]);
  const reopen = useCallback(() => send({ type: "reopen" }), [send]);
  /**
   * Show the answer and the count to everyone: `answer` when given (the option a
   * round resolved to), else the asked Learning question's own.
   */
  const reveal = useCallback(
    (given?: string | null) => {
      if (given !== undefined) return send({ type: "reveal", answer: given });
      const id = game.view.question?.id;
      // a question asked before this page was reloaded is found again in the modules
      const answer = id
        ? (answers.current.get(id) ??
          liveQuestions(MODULES).find((e) => e.question.id === id)?.question
            .answer)
        : undefined;
      return send({ type: "reveal", answer: answer ?? null });
    },
    [send, game.view.question?.id]
  );
  const end = useCallback(() => send({ type: "end" }), [send]);

  return { ...game, ask, askRound, close, reopen, reveal, end };
}

/**
 * Whether the student's school has a game open, asked every `GAME_POLL_MS` while
 * `class_games` is on and the account is enrolled in a school (`GET /schools/me`, read
 * once): nobody else's app asks, so the poll stays off the database for everyone but a
 * class (backend 0014).
 */
export function useMyGame(enabled = true) {
  const flag = useFeature("class_games");
  const enrolled = useQuery({
    queryKey: ["schools", "me"],
    queryFn: () => api.get<{ status: string }>("schools/me"),
    enabled: flag && enabled,
    staleTime: Infinity,
    retry: false,
  });
  return useQuery({
    queryKey: ["schools", "me", "game"],
    queryFn: () => api.get<MyGame>("schools/me/game"),
    enabled: flag && enabled && enrolled.data?.status === "verified",
    refetchInterval: (query) => (query.state.error ? false : GAME_POLL_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** `GET /schools/{id}/game`: whether the school's game is open, and on what. */
export interface GameState {
  open: boolean;
  plan: string | null;
}

/** The teacher's School page and start screen: is a game running to resume? */
export function useGameState(schoolId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["school", schoolId, "game"],
    queryFn: () => api.get<GameState>(`schools/${schoolId}/game`),
    enabled,
    retry: false,
  });
}

/** A student's end: joins while their school's game is open, and votes. */
export function usePlayerGame(enabled: boolean) {
  const game = useGameSocket(async () => {
    const mine = await api.get<MyGame>("schools/me/game");
    if (!mine.open || !mine.ticket) throw new TicketRefused();
    return mine.ticket;
  }, enabled);
  const { send } = game;
  const questionId = game.view.question?.id;
  const vote = useCallback(
    (option: string) =>
      questionId ? send({ type: "vote", question: questionId, option }) : false,
    [send, questionId]
  );
  return { ...game, vote };
}
