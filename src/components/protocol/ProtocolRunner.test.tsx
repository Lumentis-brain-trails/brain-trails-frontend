import { act, cleanup, render, screen } from "@testing-library/react";
import { SPACE_THEME } from "@/components/protocol/kinds/render";
import { STAGE_GROUND } from "@/lib/protocol/stage";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { ProtocolRunner } from "./ProtocolRunner";
import "./kinds";
import type { Marker } from "@/lib/protocol/marker";
import { hasTaskKind, registerTaskKind } from "@/lib/protocol/registry";
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

  test("an experiment runs on a black, still ground, whatever the app's theme", () => {
    const { container } = render(
      <div data-theme="light">
        <ProtocolRunner
          protocol={TWO_PROMPTS}
          seed={1}
          sink={createMemorySink()}
          onFinish={vi.fn()}
          onExit={vi.fn()}
        />
      </div>
    );
    const stage = container.querySelector("[data-theme='dark']") as HTMLElement;
    // pinned dark so ink stays light on it, and black, not the app's tinted ground
    expect(stage).not.toBeNull();
    expect(stage.className).toContain("bg-black");
    // nothing decorative behind a task: no gradient, no animation, no image
    expect(stage.outerHTML).not.toMatch(/gradient|animate-|blur|ribbon|aurora/);
    expect(SPACE_THEME.background).toBe(STAGE_GROUND);
    expect(STAGE_GROUND).toBe("#000000");
  });

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

  test("a timed step ends while the host re-renders with new callbacks", async () => {
    // The run page re-renders every second while a headband streams, each time with a
    // new `onFinish`; a timed step that restarted its timer on it never ended.
    const sink = createMemorySink();
    const props = (onFinish = vi.fn()) => ({
      protocol: TWO_PROMPTS,
      seed: 1,
      sink,
      onFinish,
      onExit: vi.fn(),
    });
    const hosts = [vi.fn()];
    const { rerender } = render(<ProtocolRunner {...props(hosts[0])} />);
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      hosts.push(vi.fn());
      rerender(<ProtocolRunner {...props(hosts[hosts.length - 1])} />);
    }

    expect(sink.all().map((m) => m.label)).toContain("second_end");
    // told once, and through a callback the host had passed by then, not the first one
    const calls = hosts.map((host) => host.mock.calls.length);
    expect(calls.reduce((a, b) => a + b)).toBe(1);
    expect(calls[0]).toBe(0);
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

  test("the stop prompt is on the timeline, and closing it starts nothing again", async () => {
    const { sink } = renderRunner();
    await act(async () => {
      screen.getByRole("button", { name: "Stop" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Keep going" }).click();
    });
    for (let i = 0; i < 2; i++)
      await act(async () => {
        vi.advanceTimersByTime(1100);
      });

    expect(sink.all().map((m) => m.label)).toEqual([
      "session_start",
      "first_start",
      "exit_prompt_shown",
      "exit_prompt_dismissed",
      "first_end",
      "second_start",
      "line_shown",
      "second_end",
      "session_end",
    ]);
  });

  test("nothing is recorded after the run is stopped", async () => {
    const { sink } = renderRunner();
    await act(async () => {
      screen.getByRole("button", { name: "Stop" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Stop session" }).click();
    });
    // the block is still mounted behind the ending, and its timer still fires
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const labels = sink.all().map((m) => m.label);
    expect(labels.at(-1)).toBe("run_aborted");
    expect(labels).not.toContain("first_end");
  });

  test("trials the stop prompt overlapped are marked invalid", async () => {
    // Four trials; the prompt opens during the second and closes after the third began.
    if (!hasTaskKind("test-trials"))
      registerTaskKind({
        name: "test-trials",
        configSchema: z.object({}),
        Renderer: function Trials({ emit, onComplete, stepId }) {
          useEffect(() => {
            const plan: [number, number, "stimulus" | "outcome"][] = [
              [0, 1, "stimulus"],
              [100, 1, "outcome"],
              [200, 2, "stimulus"],
              [400, 2, "outcome"],
              [600, 3, "stimulus"],
              [800, 3, "outcome"],
              [850, 4, "stimulus"],
              [900, 4, "outcome"],
            ];
            const timers = plan.map(([at, trial, kind]) =>
              setTimeout(
                () =>
                  emit({ label: `t_${kind}`, kind, meta: { trial_id: trial } }),
                at
              )
            );
            timers.push(
              setTimeout(
                () =>
                  onComplete({ stepId, taskKind: "test-trials", summary: {} }),
                1000
              )
            );
            return () => timers.forEach(clearTimeout);
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, []);
          return null;
        },
      });
    const sink = createMemorySink();
    render(
      <ProtocolRunner
        protocol={{
          ...TWO_PROMPTS,
          steps: [
            {
              id: "trials",
              kind: "test-trials",
              label: "Trials",
              phase: "trials",
              config: {},
            },
          ],
        }}
        seed={1}
        sink={sink}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    await act(async () => {
      screen.getByRole("button", { name: "Stop" }).click();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      screen.getByRole("button", { name: "Keep going" }).click();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const outcomes = sink
      .all()
      .filter((m) => m.label === "t_outcome")
      .map((m) => [m.meta.trial_id, m.meta.invalid ?? false]);
    expect(outcomes).toEqual([
      [1, false],
      [2, true],
      [3, true],
      [4, false],
    ]);
  });

  test("Escape on the opening notice does not reach the run", async () => {
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
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.queryByText("Stop this session?")).not.toBeInTheDocument();
    expect(screen.queryByText("Step one")).not.toBeInTheDocument();
    expect(sink.all()).toHaveLength(0);
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

  test("brackets block steps with block events carrying the block fields", async () => {
    // A stimulus kind that says nothing about its timing: the runner must add "ui".
    if (!hasTaskKind("test-flash"))
      registerTaskKind({
        name: "test-flash",
        configSchema: z.object({}),
        Renderer: function Flash({ emit, onComplete, stepId }) {
          useEffect(() => {
            emit({ label: "stimulus_onset", kind: "stimulus" });
            const t = setTimeout(
              () => onComplete({ stepId, taskKind: "test-flash", summary: {} }),
              500
            );
            return () => clearTimeout(t);
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, []);
          return null;
        },
      });
    const sink = createMemorySink();
    const onFinish = vi.fn();
    render(
      <ProtocolRunner
        protocol={{
          ...TWO_PROMPTS,
          steps: [
            {
              id: "flash~1",
              kind: "test-flash",
              label: "Flash",
              phase: "flash",
              config: {},
              block: {
                block_id: "flash",
                node_path: "root/loop/flash",
                iteration: 1,
                condition: "red",
              },
            },
            TWO_PROMPTS.steps[0],
          ],
        }}
        seed={1}
        sink={sink}
        onFinish={onFinish}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);

    const markers = sink.all();
    expect(markers.map((m) => m.label)).toEqual([
      "session_start",
      "block_start",
      "stimulus_onset",
      "block_end",
      "first_start",
      "first_end",
      "session_end",
    ]);
    const blockFields = {
      step_id: "flash~1",
      block_id: "flash",
      node_path: "root/loop/flash",
      iteration: 1,
      condition: "red",
    };
    const [, start, onset, end] = markers;
    expect(start.meta).toMatchObject(blockFields);
    expect(onset.meta).toMatchObject({
      ...blockFields,
      timing_source: "ui",
      timing_uncertainty_ms: 50,
    });
    expect(end.meta).toMatchObject(blockFields);
    expect(end.meta.duration).toBeCloseTo(0.5, 1);
    // A step without a block has no block fields.
    expect(markers[4].meta.block_id).toBeUndefined();
  });
});
