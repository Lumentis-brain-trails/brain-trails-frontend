"use client";

/**
 * One game round inside a neurofeedback block (V4-0013), shared by the band and the
 * landscape renderers: the game's state, the head's stillness, the hands' events on the
 * timeline, the card at the end, and what the round leaves the run's next block.
 *
 * The trained signal stays the engine's: this hook reads the engine's updates (to count
 * the light) and never changes them. What it adds is recorded on the timeline:
 *
 * - `nf_game` for every fork shown (`prompt`), every press (`response`, or `stray` with
 *   no fork open) and every fork the walker passed unanswered (`miss`), stamped at the
 *   frame or at the key's own time;
 * - `nf_round_end` with the score (light share, choices), the level and the next one,
 *   the moving share;
 * - `motion_dps` and `moving` on each `nf_update` (`motionMeta`).
 *
 * At the end of the training the card stands for `CARD_MS`, then the block finishes.
 */

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isNfGame, type NeurofeedbackConfig } from "@/lib/protocol/blocks";
import {
  Lantern,
  type LanternEvent,
  type Side,
} from "@/lib/neurofeedback/lantern";
import {
  levelKey,
  MOTION_KEY,
  nextLevel,
  type RunCarry,
  startLevel,
} from "@/lib/neurofeedback/rounds";
import { Stillness } from "@/lib/neurofeedback/stillness";
import type { Emit, MotionFeed } from "@/lib/protocol/types";
import type { FeedbackFrame } from "../frame";

/** How long the round's card stands before the block ends. */
export const CARD_MS = 5000;

/** What the card shows: no numbers but the choices and the level. */
export interface RoundCardData {
  /** Share of the clean training time the person was in target, in [0, 1]. */
  light: number;
  correct: number;
  total: number;
  level: number;
  next: number;
}

/** The head's state as the game reads it every frame. */
export interface MotionState {
  dps: number | null;
  moving: boolean;
}

export interface GameRound {
  /** False for a block whose feedback is not a game: every member is then inert. */
  active: boolean;
  lantern: Lantern | null;
  motionRef: RefObject<MotionState>;
  /** The game's prompts and misses of one frame, stamped at that frame. */
  onEvents(events: LanternEvent[], frameMs: number): void;
  /** A press of `side` at `atMs` (the input event's own time). */
  press(side: Side, atMs: number): void;
  /** Each engine update, to count the light: training, clean, in target. */
  onUpdate(update: {
    phase: "baseline" | "training";
    inTarget: boolean | null;
    gated: unknown;
  }): void;
  /** What `nf_update` adds while a game reads stillness. */
  motionMeta(): Record<string, unknown>;
  /** The card, once the training ran its length; null before. */
  card: RoundCardData | null;
  /** The training ran its length: the round's end, then the card, then `finish`. */
  end(summary: Record<string, unknown>): void;
}

export function useGameRound({
  config,
  seed,
  reducedMotion,
  motion,
  carry,
  carried,
  emit,
  frameRef,
  finish,
}: {
  config: NeurofeedbackConfig;
  seed: number;
  reducedMotion: boolean;
  motion?: MotionFeed;
  carry?: RunCarry;
  /** Whether the engine took a carried threshold: then there is no baseline. */
  carried: boolean;
  emit: RefObject<Emit>;
  frameRef: RefObject<FeedbackFrame>;
  finish: (summary: Record<string, unknown>) => void;
}): GameRound {
  const active = isNfGame(config.feedback);
  const level = useMemo(() => startLevel(config, carry), [config, carry]);
  const lantern = useMemo(
    () =>
      active && config.feedback === "lantern"
        ? new Lantern(level, seed, reducedMotion)
        : null,
    [active, config.feedback, level, seed, reducedMotion]
  );
  const stillness = useMemo(
    () => new Stillness(carried ? (carry?.get(MOTION_KEY) ?? null) : null),
    [carried, carry]
  );
  const motionRef = useRef<MotionState>({ dps: null, moving: false });
  const light = useRef({ clean: 0, inTarget: 0 });
  const moves = useRef({ readings: 0, moving: 0 });
  const [card, setCard] = useState<RoundCardData | null>(null);
  const ended = useRef(false);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a block ended from outside (the operator) while its card stood must not finish later
  useEffect(
    () => () => {
      if (cardTimer.current) clearTimeout(cardTimer.current);
    },
    []
  );

  // the head, reading by reading; learning its limit while the baseline runs
  useEffect(() => {
    if (!active || !motion) return;
    return motion.subscribe((sample) => {
      const phase = frameRef.current?.phase ?? "baseline";
      if (phase === "training" && !stillness.settled) {
        const limit = stillness.settle();
        carry?.set(MOTION_KEY, limit);
      }
      stillness.push(sample, phase === "baseline");
      motionRef.current = { dps: stillness.dps, moving: stillness.moving };
      if (phase === "training") {
        moves.current.readings += 1;
        if (stillness.moving) moves.current.moving += 1;
      }
    });
  }, [active, carry, frameRef, motion, stillness]);

  const onEvents = useCallback(
    (events: LanternEvent[], frameMs: number) => {
      for (const e of events)
        emitGame(
          emit,
          e,
          lantern?.level ?? level,
          motionRef.current.moving,
          frameMs
        );
    },
    [emit, lantern, level]
  );

  const press = useCallback(
    (side: Side, atMs: number) => {
      if (!lantern || ended.current) return;
      const ageS = Math.max(0, (performance.now() - atMs) / 1000);
      emitGame(
        emit,
        lantern.press(side, ageS),
        lantern.level,
        motionRef.current.moving,
        atMs
      );
    },
    [emit, lantern]
  );

  const onUpdate = useCallback<GameRound["onUpdate"]>((u) => {
    if (u.phase !== "training" || u.gated || u.inTarget === null) return;
    light.current.clean += 1;
    if (u.inTarget) light.current.inTarget += 1;
  }, []);

  const motionMeta = useCallback((): Record<string, unknown> => {
    if (!active || !motion) return {};
    const m = motionRef.current;
    return {
      motion_dps: m.dps === null ? null : Math.round(m.dps * 10) / 10,
      moving: m.moving,
    };
  }, [active, motion]);

  const end = useCallback(
    (summary: Record<string, unknown>) => {
      if (ended.current) return;
      ended.current = true;
      if (!lantern) {
        finish(summary);
        return;
      }
      const tally = lantern.tally;
      const answered = tally.correct + tally.wrong + tally.missed;
      const next = nextLevel(lantern.level, tally.correct, answered);
      carry?.set(levelKey(config.feedback), next);
      const lightShare = light.current.clean
        ? light.current.inTarget / light.current.clean
        : 0;
      const movingShare = moves.current.readings
        ? moves.current.moving / moves.current.readings
        : null;
      const game = {
        game: config.feedback,
        level: lantern.level,
        next_level: next,
        prompts: tally.prompts,
        correct: tally.correct,
        wrong: tally.wrong,
        missed: tally.missed,
        stray: tally.stray,
        light_share: round4(lightShare),
        moving_share: movingShare === null ? null : round4(movingShare),
        stillness_limit_dps: motion
          ? Math.round(stillness.limit * 10) / 10
          : null,
      };
      emit.current?.({ label: "nf_round_end", kind: "outcome", meta: game });
      setCard({
        light: lightShare,
        correct: tally.correct,
        total: answered,
        level: lantern.level,
        next,
      });
      cardTimer.current = setTimeout(
        () => finish({ ...summary, game }),
        CARD_MS
      );
    },
    [carry, config.feedback, emit, finish, lantern, motion, stillness]
  );

  // one object while nothing changes: the renderers' signal effects depend on it
  return useMemo(
    () => ({
      active,
      lantern,
      motionRef,
      onEvents,
      press,
      onUpdate,
      motionMeta,
      card,
      end,
    }),
    [active, lantern, onEvents, press, onUpdate, motionMeta, card, end]
  );
}

function emitGame(
  emit: RefObject<Emit>,
  e: LanternEvent,
  level: number,
  moving: boolean,
  atMs: number
) {
  const kind =
    e.event === "prompt"
      ? "stimulus"
      : e.event === "miss"
        ? "outcome"
        : "response";
  const meta: Record<string, unknown> = {
    event: e.event,
    side: e.side,
    level,
    moving,
  };
  if (e.event !== "stray") {
    meta.fork = e.fork;
    meta.scored = e.scored;
  }
  if (e.event === "response") {
    meta.correct = e.correct;
    meta.rt_ms = e.rtMs;
  }
  emit.current?.({ label: "nf_game", kind, meta }, atMs);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
