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
import {
  OPERATOR_COMMAND_EVENT,
  type RunnerState,
  createLocalCommandPort,
} from "@/lib/protocol/commands";
import type { EegPacket } from "@/lib/neurofeedback/engine";
import {
  makeRecording,
  packetsOf,
} from "@/lib/neurofeedback/recording.fixture";
import { parseProtocol } from "@/lib/protocol/schema";
import { toWireEvent } from "@/lib/protocol/marker";
import { createMemorySink } from "@/lib/protocol/sink";
import type { EegFeed, ProtocolDefinition } from "@/lib/protocol/types";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: IntlEn });

/** A feed fed by hand, as the console channel or `useMuse` would feed it. */
function handFeed() {
  const listeners = new Set<(p: EegPacket) => void>();
  const feed: EegFeed = {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    feed,
    push: (packets: EegPacket[]) =>
      act(() => {
        for (const p of packets) for (const l of [...listeners]) l(p);
      }),
    get listening() {
      return listeners.size;
    },
  };
}

// parsed as every real plan is, so the kind's defaults are filled in
const PLAN: ProtocolDefinition = parseProtocol({
  id: "nf-test",
  version: 1,
  title: "Neurofeedback",
  steps: [
    {
      id: "nf",
      kind: "neurofeedback",
      label: "Alpha",
      config: { src: "https://x/v.mp4", baseline_s: 4, duration_s: 30 },
      block: { block_id: "nf", node_path: "nf", iteration: null },
    },
  ],
});

const frames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe("the neurofeedback block in the runner", () => {
  afterEach(() => cleanup());

  test("without a headband it says so and moves on", () => {
    const sink = createMemorySink();
    const onFinish = vi.fn();
    render(
      <ProtocolRunner
        protocol={PLAN}
        seed={1}
        sink={sink}
        onFinish={onFinish}
        onExit={vi.fn()}
      />
    );
    expect(
      screen.getByText(messages.kinds.neurofeedback.needsHeadband)
    ).toBeInTheDocument();
    act(() => screen.getByText(messages.kinds.common.continue).click());
    const start = sink.all().find((m) => m.label === "nf_start");
    expect(start?.meta).toMatchObject({ live_signal: false, signal: "alpha" });
  });

  test("baseline, threshold, updates, an operator's nudge, then the block ends", async () => {
    const sink = createMemorySink();
    const port = createLocalCommandPort();
    const hand = handFeed();
    const { feed, push } = hand;
    const states: RunnerState[] = [];
    const onFinish = vi.fn();
    const { container } = render(
      <ProtocolRunner
        protocol={PLAN}
        seed={1}
        sink={sink}
        commands={port}
        signal={feed}
        onState={(s) => states.push(s)}
        onFinish={onFinish}
        onExit={vi.fn()}
      />
    );
    expect(hand.listening).toBe(1);
    expect(states.at(-1)?.nudgeable).toBe(true);
    const video = container.querySelector("video")!;
    expect(video.style.filter).toBe("brightness(0.7000)");

    const packets = packetsOf(
      makeRecording({ seconds: 40, alphaOn: [[10, 20]] })
    );
    // the baseline and the first seconds of training
    await push(packets.slice(0, 21 * 4 * 10));
    await frames();
    const labels = sink.all().map((m) => m.label);
    expect(labels.filter((l) => l === "nf_start")).toHaveLength(1);
    expect(labels.filter((l) => l === "nf_baseline_start")).toHaveLength(1);
    expect(labels).toContain("nf_baseline_end");
    const set = sink.all().find((m) => m.label === "nf_threshold");
    expect(set?.meta).toMatchObject({ cause: "baseline", previous: null });
    const updates = sink.all().filter((m) => m.label === "nf_update");
    expect(updates.length).toBeGreaterThan(50);
    expect(updates[0].meta).toMatchObject({
      nf_phase: "baseline",
      // the runner's own phase of the step is not overwritten
      phase: "nf",
      step_id: "nf",
      block_id: "nf",
      timing_source: "raf",
    });
    expect(typeof updates[0].meta?.sample_end).toBe("number");
    // small enough for ten a second over half an hour
    const wire = JSON.stringify(toWireEvent(updates.at(-1)!));
    expect(wire.length).toBeLessThan(560);
    expect(typeof updates.at(-1)?.meta?.age_ms).toBe("number");
    expect(video.style.filter).toMatch(/^brightness\(/);

    act(() =>
      port.send({
        id: "n1",
        type: "nudge_threshold",
        steps: 2,
        source: "console",
      })
    );
    const command = sink
      .all()
      .find(
        (m) => m.label === OPERATOR_COMMAND_EVENT && m.meta?.command_id === "n1"
      );
    expect(command?.meta).toMatchObject({ effect: "applied", steps: 2 });
    const nudged = sink
      .all()
      .filter((m) => m.label === "nf_threshold")
      .at(-1);
    expect(nudged?.meta).toMatchObject({
      cause: "operator",
      steps: 2,
      command_id: "n1",
    });
    expect(Number(nudged?.meta?.threshold)).toBeCloseTo(
      Number(set?.meta?.threshold) * 1.05 ** 2,
      9
    );

    // the rest of the training: the block ends on its own and the run finishes
    await push(packets.slice(21 * 4 * 10));
    await frames();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [results] = onFinish.mock.calls[0];
    expect(results[0].summary).toMatchObject({
      ended: "duration",
      direction: "up",
      channels: ["TP9", "TP10"],
      nudges: 1,
    });
  });

  test("a nudge for another kind of block is logged and ignored", () => {
    const sink = createMemorySink();
    const port = createLocalCommandPort();
    render(
      <ProtocolRunner
        protocol={parseProtocol({
          ...PLAN,
          steps: [
            {
              id: "rest",
              kind: "rest",
              label: "Rest",
              config: { duration_s: 30 },
            },
          ],
        })}
        seed={1}
        sink={sink}
        commands={port}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    act(() =>
      port.send({
        id: "n2",
        type: "nudge_threshold",
        steps: 1,
        source: "console",
      })
    );
    const command = sink.all().find((m) => m.label === OPERATOR_COMMAND_EVENT);
    expect(command?.meta).toMatchObject({ effect: "ignored" });
  });
});
