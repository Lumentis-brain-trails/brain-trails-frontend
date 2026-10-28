import {
  act,
  cleanup,
  render as rtlRender,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import messages from "../../../messages/en.json";
import { ProtocolRunner } from "./ProtocolRunner";
import "./kinds";
import {
  type CommandType,
  type LocalCommandPort,
  MESSAGE_SHOWN_MS,
  OPERATOR_COMMAND_EVENT,
  type RunnerState,
  createLocalCommandPort,
} from "@/lib/protocol/commands";
import type { Marker } from "@/lib/protocol/marker";
import { createMemorySink } from "@/lib/protocol/sink";
import type { ProtocolDefinition, ProtocolStep } from "@/lib/protocol/types";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: IntlEn });

/** A timed instruction block of `ms`, resolved from a tree block like a real plan's. */
function block(id: string, text: string, ms = 1000): ProtocolStep {
  return {
    id,
    kind: "prompt",
    label: id,
    phase: id,
    config: {
      lines: [{ text, holdMs: 100 }],
      advance: { mode: "timed", ms },
    },
    block: { block_id: id, node_path: id, iteration: null },
  };
}

const THREE_BLOCKS: ProtocolDefinition = {
  id: "console-test",
  version: 1,
  title: "Console test",
  startMarker: "session_start",
  endMarker: "session_end",
  steps: [
    block("first", "Step one"),
    block("second", "Step two"),
    block("third", "Step three"),
  ],
};

let ids = 0;
function send(port: LocalCommandPort, type: CommandType, text?: string) {
  ids += 1;
  act(() =>
    port.send({
      id: `c${ids}`,
      type,
      source: "console",
      ...(text ? { text } : {}),
    })
  );
}

const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

const commandsOf = (markers: readonly Marker[]) =>
  markers.filter((m) => m.label === OPERATOR_COMMAND_EVENT);

const labels = (markers: readonly Marker[]) => markers.map((m) => m.label);

describe("ProtocolRunner command port", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderRunner(protocol: ProtocolDefinition = THREE_BLOCKS) {
    const sink = createMemorySink();
    const port = createLocalCommandPort();
    const onFinish = vi.fn();
    const onExit = vi.fn();
    const states: RunnerState[] = [];
    render(
      <ProtocolRunner
        protocol={protocol}
        seed={1}
        sink={sink}
        commands={port}
        onState={(state) => states.push(state)}
        onFinish={onFinish}
        onExit={onExit}
      />
    );
    return { sink, port, onFinish, onExit, states };
  }

  test("a pause waits for the block to end, holds the run, and resume moves on", async () => {
    const { sink, port, states } = renderRunner();
    expect(screen.getByText("Step one")).toBeInTheDocument();

    send(port, "pause");
    // the block on screen is never cut: still the first one
    expect(screen.getByText("Step one")).toBeInTheDocument();
    expect(states.at(-1)).toMatchObject({
      status: "running",
      pausePending: true,
    });
    const [pause] = commandsOf(sink.all());
    expect(pause.meta).toMatchObject({
      command: "pause",
      effect: "deferred",
      safe_point: "block_end",
      step_id: "first",
    });

    await advance(1100);
    // the block ended by itself; the run holds before the second
    expect(screen.queryByText("Step two")).not.toBeInTheDocument();
    expect(screen.getByText(messages.run.runner.paused)).toBeInTheDocument();
    expect(states.at(-1)).toMatchObject({
      status: "paused",
      pausePending: false,
    });
    expect(labels(sink.all())).toContain("run_paused");

    // a held run stays held, however long
    await advance(30_000);
    expect(screen.queryByText("Step two")).not.toBeInTheDocument();

    send(port, "resume");
    expect(screen.getByText("Step two")).toBeInTheDocument();
    expect(states.at(-1)).toMatchObject({ status: "running", stepIndex: 1 });
    const resumed = sink.all().find((m) => m.label === "run_resumed");
    expect(resumed?.meta.paused_ms).toBeGreaterThanOrEqual(30_000);
    // the block after a pause still opens with its own block_start
    const order = labels(sink.all());
    expect(order.indexOf("run_resumed")).toBeLessThan(
      order.lastIndexOf("block_start")
    );
  });

  test("resume before the block ends cancels the pause", async () => {
    const { sink, port } = renderRunner();
    send(port, "pause");
    send(port, "resume");
    await advance(1100);
    expect(screen.getByText("Step two")).toBeInTheDocument();
    expect(labels(sink.all())).not.toContain("run_paused");
    expect(commandsOf(sink.all()).map((m) => m.meta)).toMatchObject([
      { command: "pause", effect: "deferred" },
      { command: "resume", effect: "applied", cancelled: "pause" },
    ]);
  });

  test("skip_block ends the block now and marks it skipped", async () => {
    const { sink, port } = renderRunner();
    await advance(200);
    send(port, "skip_block");
    expect(screen.getByText("Step two")).toBeInTheDocument();

    const ends = sink.all().filter((m) => m.label === "block_end");
    expect(ends).toHaveLength(1);
    expect(ends[0].meta).toMatchObject({
      block_id: "first",
      ended_by: "operator",
      skipped: true,
    });
    expect(ends[0].meta.duration).toBeLessThan(1);
    expect(commandsOf(sink.all())[0].meta).toMatchObject({
      command: "skip_block",
      effect: "applied",
      safe_point: "now",
      step_id: "first",
    });

    // the skipped block's own timer must not advance the run a second time
    await advance(900);
    expect(screen.getByText("Step two")).toBeInTheDocument();
  });

  test("end_block closes the block as ended, not skipped, and the run finishes", async () => {
    const { sink, port, onFinish } = renderRunner();
    send(port, "end_block");
    send(port, "end_block");
    send(port, "end_block");
    await act(async () => {}); // the sink flushes before the run hands over
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [results] = onFinish.mock.calls[0];
    expect(results).toHaveLength(3);
    expect(results[0].summary).toEqual({ ended_by: "operator" });
    const ends = sink.all().filter((m) => m.label === "block_end");
    expect(ends.map((m) => m.meta.skipped)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(labels(sink.all()).at(-1)).toBe("session_end");
  });

  test("a message shows on the participant's screen for a while", async () => {
    const { sink, port, states } = renderRunner();
    send(port, "message", "Relax your jaw, please");
    expect(screen.getByText("Relax your jaw, please")).toBeInTheDocument();
    expect(states.at(-1)?.message).toBe("Relax your jaw, please");
    expect(commandsOf(sink.all())[0].meta).toMatchObject({
      command: "message",
      text: "Relax your jaw, please",
      effect: "applied",
    });
    // the block underneath keeps running
    expect(screen.getByText("Step one")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(MESSAGE_SHOWN_MS - 100);
    });
    await advance(200);
    expect(
      screen.queryByText("Relax your jaw, please")
    ).not.toBeInTheDocument();
  });

  test("a flag changes nothing but the log", () => {
    const { sink, port } = renderRunner();
    const before = labels(sink.all());
    send(port, "flag", "blinked a lot");
    expect(labels(sink.all())).toEqual([...before, OPERATOR_COMMAND_EVENT]);
    expect(commandsOf(sink.all())[0].meta).toMatchObject({
      command: "flag",
      text: "blinked a lot",
    });
    expect(screen.getByText("Step one")).toBeInTheDocument();
  });

  test("abort stops the run as the operator's decision", async () => {
    const { sink, port, onExit } = renderRunner();
    send(port, "abort");
    await act(async () => {});
    expect(onExit).toHaveBeenCalledWith("operator");
    const aborted = sink.all().find((m) => m.label === "run_aborted");
    expect(aborted?.meta.reason).toBe("operator");
    // logged before the run closed
    expect(commandsOf(sink.all())[0].meta).toMatchObject({
      command: "abort",
      effect: "applied",
    });
    send(port, "flag");
    expect(commandsOf(sink.all())).toHaveLength(1);
  });

  test("every command is logged once, applied or not", async () => {
    const { sink, port } = renderRunner();
    send(port, "resume"); // nothing to resume
    send(port, "pause");
    send(port, "pause"); // already asked
    send(port, "flag");
    send(port, "message"); // no words
    await advance(1100); // the hold begins
    send(port, "skip_block"); // nothing on screen to skip
    send(port, "resume");
    const effects = commandsOf(sink.all()).map((m) => [
      m.meta.command,
      m.meta.effect,
    ]);
    expect(effects).toEqual([
      ["resume", "ignored"],
      ["pause", "deferred"],
      ["pause", "ignored"],
      ["flag", "applied"],
      ["message", "ignored"],
      ["skip_block", "ignored"],
      ["resume", "applied"],
    ]);
  });

  test("a second End in the same tick ends nothing more and says so", async () => {
    const { sink, port } = renderRunner();
    // both arrive before the runner re-renders onto the next block
    act(() => {
      port.send({ id: "e1", type: "end_block", source: "console" });
      port.send({ id: "e2", type: "end_block", source: "console" });
    });
    expect(screen.getByText("Step two")).toBeInTheDocument();
    expect(sink.all().filter((m) => m.label === "block_end")).toHaveLength(1);
    expect(
      commandsOf(sink.all()).map((m) => [m.meta.command_id, m.meta.effect])
    ).toEqual([
      ["e1", "applied"],
      ["e2", "ignored"],
    ]);
    // the second block runs its full course
    await advance(900);
    expect(screen.getByText("Step two")).toBeInTheDocument();
  });

  test("a command delivered twice is applied once", () => {
    const { sink, port } = renderRunner();
    const command = {
      id: "same",
      type: "skip_block" as const,
      source: "console" as const,
    };
    act(() => port.send(command));
    act(() => port.send(command));
    expect(screen.getByText("Step two")).toBeInTheDocument();
    expect(commandsOf(sink.all())).toHaveLength(1);
  });

  test("before the participant begins only abort means anything", () => {
    const moving: ProtocolDefinition = {
      ...THREE_BLOCKS,
      contentWarning: "Flashing lights",
    };
    const { sink, port, onExit, states } = renderRunner(moving);
    expect(states.at(-1)?.status).toBe("warning");
    send(port, "skip_block");
    send(port, "pause");
    expect(sink.all()).toHaveLength(0);
    send(port, "abort");
    expect(onExit).toHaveBeenCalledWith("operator");
  });

  test("repeat_block closes the attempt and runs the same block again", async () => {
    const { sink, port, states } = renderRunner();
    await advance(400);
    send(port, "repeat_block");
    // still the first block, on its second attempt
    expect(screen.getByText("Step one")).toBeInTheDocument();
    expect(states.at(-1)).toMatchObject({ stepIndex: 0, attempt: 1 });
    const blocks = sink
      .all()
      .filter((m) => m.label === "block_start" || m.label === "block_end");
    expect(blocks.map((m) => m.label)).toEqual([
      "block_start",
      "block_end",
      "block_start",
    ]);
    expect(blocks[1].meta).toMatchObject({
      block_id: "first",
      ended_by: "operator",
      repeated: true,
    });
    expect(blocks[2].meta).toMatchObject({ block_id: "first", attempt: 1 });
    expect(commandsOf(sink.all())[0].meta).toMatchObject({
      command: "repeat_block",
      effect: "applied",
    });

    // the repeated attempt runs its whole time again, then the run moves on once
    await advance(700);
    expect(screen.getByText("Step one")).toBeInTheDocument();
    await advance(400);
    expect(screen.getByText("Step two")).toBeInTheDocument();
    expect(
      sink
        .all()
        .filter((m) => m.label === "block_end" && m.meta?.block_id === "first")
    ).toHaveLength(2);
  });

  test("extend_rest adds time to a timed rest and nothing else", async () => {
    const rest: ProtocolStep = {
      id: "rest",
      kind: "rest",
      label: "rest",
      phase: "rest",
      config: { mode: "timed", duration_s: 2 },
      block: { block_id: "rest", node_path: "rest", iteration: null },
    };
    const { sink, port, states } = renderRunner({
      ...THREE_BLOCKS,
      steps: [block("first", "Step one", 500), rest, block("last", "The end")],
    });
    expect(states.at(-1)).toMatchObject({ extendable: false });
    send(port, "extend_rest");
    expect(commandsOf(sink.all()).at(-1)?.meta).toMatchObject({
      command: "extend_rest",
      effect: "ignored",
    });

    await advance(600);
    expect(states.at(-1)).toMatchObject({ stepIndex: 1, extendable: true });
    await advance(1000);
    send(port, "extend_rest");
    expect(commandsOf(sink.all()).at(-1)?.meta).toMatchObject({
      command: "extend_rest",
      effect: "applied",
      extended_s: 30,
      total_s: 32,
    });
    // the 2 s rest would have ended here; it now lasts 32 s from its start
    await advance(2000);
    expect(states.at(-1)).toMatchObject({ stepIndex: 1 });
    await advance(29_100);
    expect(screen.getByText("The end")).toBeInTheDocument();
  });

  test("a resumed runner picks the run up at its block, with fresh seq numbers", async () => {
    const sink = createMemorySink();
    render(
      <ProtocolRunner
        protocol={THREE_BLOCKS}
        seed={1}
        sink={sink}
        resume={{ stepIndex: 1, seqFrom: 40, interrupted: true }}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    // no notice screen, no session_start: straight into the second block
    expect(screen.getByText("Step two")).toBeInTheDocument();
    const markers = sink.all();
    expect(labels(markers).slice(0, 3)).toEqual([
      "run_reloaded",
      "block_end",
      "block_start",
    ]);
    expect(labels(markers)).not.toContain("session_start");
    expect(markers[0].seq).toBe(40);
    expect(markers[1].meta).toMatchObject({
      block_id: "second",
      ended_by: "reload",
    });
  });
});
