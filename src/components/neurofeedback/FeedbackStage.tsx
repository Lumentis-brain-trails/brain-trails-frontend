"use client";

/**
 * What a neurofeedback block shows (V4-0009, V4-0010): the author's video, its
 * brightness and blur written straight to its style by the block, or one of the
 * built-in animations, which read `frameRef` on every animation frame.
 */

import type { RefObject } from "react";
import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import type { FeedbackFrame } from "./frame";
import { PlaneFeedback } from "./PlaneFeedback";
import { RibbonsFeedback } from "./RibbonsFeedback";
import { TuningFeedback } from "./TuningFeedback";

export function FeedbackStage({
  feedback,
  src,
  frameRef,
  videoRef,
  videoStyle,
}: {
  feedback: NeurofeedbackConfig["feedback"];
  src?: string;
  frameRef: RefObject<FeedbackFrame>;
  videoRef: (el: HTMLVideoElement | null) => void;
  videoStyle: React.CSSProperties;
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
    </div>
  );
}
