import {
  act,
  cleanup,
  render as rtlRender,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import messages from "../../../../messages/en.json";
import { ProtocolRunner } from "../ProtocolRunner";
import "./index";
import type { LandscapePoint } from "@/lib/neurofeedback/landscape";
import { parseProtocol } from "@/lib/protocol/schema";
import { toWireEvent } from "@/lib/protocol/marker";
import { createMemorySink } from "@/lib/protocol/sink";
import type { PositionFeed, ProtocolDefinition } from "@/lib/protocol/types";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: IntlEn });

function handFeed() {
  const listeners = new Set<(p: LandscapePoint) => void>();
  const feed: PositionFeed = {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    feed,
    push: (points: LandscapePoint[]) =>
      act(() => {
        for (const p of points) for (const l of [...listeners]) l(p);
      }),
  };
}

const plan = (feedback: string): ProtocolDefinition =>
  parseProtocol({
    id: "lf-test",
    version: 1,
    title: "Landscape",
    steps: [
      {
        id: "lf",
        kind: "neurofeedback",
        label: "Focus",
        config: {
          signal: "landscape_region",
          feedback,
          targets: { points: [[0, 0]], radius: 1, epoch: 2, preset: "focus" },
          baseline_s: 10,
          duration_s: 30,
        },
        block: { block_id: "lf", node_path: "lf", iteration: null },
      },
    ],
  });

const point = (i: number, x: number): LandscapePoint => ({
  i,
  x,
  y: 0,
  hostMs: performance.now(),
  lagMs: 900,
  ownMap: true,
  epoch: null,
});

const frames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe("neurofeedback on the landscape, in the runner", () => {
  afterEach(() => cleanup());

  test("without the live service it says so and moves on", () => {
    const sink = createMemorySink();
    render(
      <ProtocolRunner
        protocol={plan("plane")}
        seed={1}
        sink={sink}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    expect(
      screen.getByText(messages.kinds.neurofeedback.needsLive)
    ).toBeInTheDocument();
    act(() => screen.getByText(messages.kinds.common.continue).click());
    const start = sink.all().find((m) => m.label === "nf_start");
    expect(start?.meta).toMatchObject({
      signal: "landscape_region",
      feedback: "plane",
      live_signal: false,
      epoch: 2,
    });
  });

  test("a baseline, then the training follows the person toward the target, and ends", async () => {
    const sink = createMemorySink();
    const onFinish = vi.fn();
    const { feed, push } = handFeed();
    const { container } = render(
      <ProtocolRunner
        protocol={plan("ribbons")}
        seed={1}
        sink={sink}
        position={feed}
        onFinish={onFinish}
        onExit={vi.fn()}
      />
    );
    expect(container.querySelector("[data-feedback=ribbons]")).not.toBeNull();
    await push(Array.from({ length: 10 }, (_, i) => point(i, 1 + (i % 2))));
    await push(Array.from({ length: 10 }, (_, i) => point(10 + i, 0)));
    await frames();
    const labels = sink.all().map((m) => m.label);
    expect(labels).toContain("nf_baseline_end");
    const threshold = sink.all().find((m) => m.label === "nf_threshold");
    expect(threshold?.meta).toMatchObject({ cause: "baseline" });
    const updates = sink.all().filter((m) => m.label === "nf_update");
    expect(updates).toHaveLength(20);
    expect(updates.at(-1)?.meta).toMatchObject({
      nf_phase: "training",
      window: 19,
      in_target: true,
      distance: 0,
      timing_source: "raf",
    });
    expect(typeof updates.at(-1)?.meta?.age_ms).toBe("number");
    expect(JSON.stringify(toWireEvent(updates.at(-1)!)).length).toBeLessThan(
      600
    );

    await push(Array.from({ length: 25 }, (_, i) => point(20 + i, 0)));
    await frames();
    expect(onFinish).toHaveBeenCalled();
  });
});
