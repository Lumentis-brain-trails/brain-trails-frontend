import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProtocolRunner } from "./ProtocolRunner";
import "./kinds";
import type { Marker } from "@/lib/protocol/marker";
import { createMemorySink } from "@/lib/protocol/sink";
import type { ProtocolDefinition } from "@/lib/protocol/types";

const TWO_PROMPTS: ProtocolDefinition = {
  id: "test-protocol",
  version: 1,
  title: "Test Protocol",
  startMarker: "session_start",
  endMarker: "session_end",
  steps: [
    {
      id: "first",
      kind: "prompt",
      label: "First",
      phase: "first",
      startMarker: "first_start",
      endMarker: "first_end",
      config: {
        lines: [{ text: "Step one", holdMs: 100 }],
        advance: { mode: "timed", ms: 1000 },
      },
    },
    {
      id: "second",
      kind: "prompt",
      label: "Second",
      phase: "second",
      startMarker: "second_start",
      endMarker: "second_end",
      config: {
        lines: [{ text: "Step two", marker: "line_shown", holdMs: 100 }],
        advance: { mode: "timed", ms: 1000 },
      },
    },
  ],
};

describe("ProtocolRunner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    // vitest runs without globals, so testing-library never registers its own
    // auto-cleanup; without this the previous test's DOM leaks into the next one.
    cleanup();
    vi.useRealTimers();
  });

  function renderRunner() {
    const sink = createMemorySink();
    const onFinish = vi.fn();
    const onExit = vi.fn();
    render(
      <ProtocolRunner
        protocol={TWO_PROMPTS}
        seed={1}
        sink={sink}
        onFinish={onFinish}
        onExit={onExit}
      />
    );
    return { sink, onFinish, onExit };
  }

  test("advances through every step and brackets the run with markers", async () => {
    const { sink, onFinish } = renderRunner();
    expect(screen.getByText("Step one")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByText("Step two")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);

    const labels = sink.all().map((m) => m.label);
    expect(labels).toEqual([
      "session_start",
      "first_start",
      "first_end",
      "second_start",
      "line_shown",
      "second_end",
      "session_end",
    ]);
  });

  test("stamps provenance and a run clock onto every marker", async () => {
    const { sink } = renderRunner();
    await act(async () => {
      vi.advanceTimersByTime(2200);
    });

    const markers: readonly Marker[] = sink.all();
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker.meta.protocol_id).toBe("test-protocol");
      expect(marker.meta.protocol_version).toBe(1);
      expect(typeof marker.tMonotonicMs).toBe("number");
      expect(typeof marker.tRunMs).toBe("number");
      // No headband is wired, so nothing may claim an EEG-aligned time.
      expect(marker.tSessionS).toBeNull();
    }
    const stepMarker = markers.find((m) => m.label === "second_start");
    expect(stepMarker?.meta.step_id).toBe("second");
    expect(stepMarker?.meta.phase).toBe("second");
    expect(stepMarker?.meta.task_kind).toBe("prompt");
  });

  test("the stop control is reachable at every step and confirms before aborting", async () => {
    const { sink, onExit } = renderRunner();

    await act(async () => {
      screen.getByRole("button", { name: "Stop" }).click();
    });
    expect(screen.getByText("Stop this session?")).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole("button", { name: "Keep going" }).click();
    });
    expect(screen.queryByText("Stop this session?")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: "Stop" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Stop session" }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onExit).toHaveBeenCalledWith("user");
    const aborted = sink.all().find((m) => m.label === "run_aborted");
    expect(aborted?.meta.step_id).toBe("first");
  });

  test("shows the content warning before anything runs when one is declared", () => {
    const sink = createMemorySink();
    render(
      <ProtocolRunner
        protocol={{ ...TWO_PROMPTS, contentWarning: "Things move on screen." }}
        seed={1}
        sink={sink}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    expect(screen.getByText("Things move on screen.")).toBeInTheDocument();
    expect(screen.getByText(/not a medical assessment/i)).toBeInTheDocument();
    expect(screen.queryByText("Step one")).not.toBeInTheDocument();
    expect(sink.all()).toHaveLength(0);
  });
});
