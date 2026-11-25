"use client";

/**
 * What a neurofeedback block shows (V4-0009, V4-0010): the author's video, its
 * brightness and blur written straight to its style by the block, or one of the
 * built-in animations, which read `frameRef` on every animation frame, or a game
 * (V4-0013) that reads it too and adds the hands, with its card at the round's end.
 */

import type { RefObject } from "react";
import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import type { FeedbackFrame } from "./frame";
import { LanternGame } from "./games/LanternGame";
import { RoundCard } from "./games/RoundCard";
import type { GameRound } from "./games/useGameRound";
import { PlaneFeedback } from "./PlaneFeedback";
import { RibbonsFeedback } from "./RibbonsFeedback";
import { TuningFeedback } from "./TuningFeedback";

export function FeedbackStage({
  feedback,
  src,
  frameRef,
  videoRef,
  videoStyle,
  game,
  minLevel = 0.4,
  reducedMotion = false,
}: {
  feedback: NeurofeedbackConfig["feedback"];
  src?: string;
  frameRef: RefObject<FeedbackFrame>;
  videoRef: (el: HTMLVideoElement | null) => void;
  videoStyle: React.CSSProperties;
  /** A game's round (V4-0013); inert for the video and the animations. */
  game?: GameRound;
  /** The block's `min_level`: the brightness fully out of target. */
  minLevel?: number;
  reducedMotion?: boolean;
}) {
  return (
    <div
      data-feedback={feedback}
      className="relative flex h-full w-full items-center justify-center bg-black"
    >
      {feedback === "video" && (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          style={videoStyle}
          className="max-h-full max-w-full"
        />
      )}
      {feedback === "plane" && <PlaneFeedback frameRef={frameRef} />}
      {feedback === "tuning" && <TuningFeedback frameRef={frameRef} />}
      {feedback === "ribbons" && <RibbonsFeedback frameRef={frameRef} />}
      {feedback === "lantern" && game?.lantern && (
        <LanternGame
          frameRef={frameRef}
          motionRef={game.motionRef}
          lantern={game.lantern}
          minLevel={minLevel}
          reducedMotion={reducedMotion}
          paused={game.card !== null}
          onEvents={game.onEvents}
          onPress={game.press}
        />
      )}
      {game?.card && <RoundCard card={game.card} />}
    </div>
  );
}
