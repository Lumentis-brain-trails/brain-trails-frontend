import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../../../messages/en.json";
import "./index";
import type { MarkerDraft } from "@/lib/protocol/marker";
import { getTaskKind } from "@/lib/protocol/registry";
import type { TaskResult } from "@/lib/protocol/types";

/**
 * The trial kinds run on animation frames, so the tests own the frame clock: `pump`
 * delivers frames at 60 Hz up to a time, and a key press lands on the frame it follows.
 */
let frames: FrameRequestCallback[] = [];
let clock = 0;

async function pump(untilMs: number) {
  while (clock < untilMs) {
    clock += 1000 / 60;
    const due = frames;
    frames = [];
    await act(async () => {
      for (const cb of due) cb(clock);
    });
  }
}

function mount(kind: string, config: unknown) {
  const emitted: MarkerDraft[] = [];
  const results: TaskResult[] = [];
  const { Renderer, configSchema } = getTaskKind(kind);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Renderer
        config={configSchema.parse(config) as never}
        stepId="s1"
        phase="s1"
        seed={1}
        emit={(draft) => emitted.push(draft)}
        onComplete={(r) => results.push(r)}
        reducedMotion={false}
      />
    </NextIntlClientProvider>
  );
  const outcomes = () =>
    emitted.filter((e) => e.kind === "outcome").map((e) => e.meta ?? {});
  return { emitted, results, outcomes };
}

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("flanker", () => {
  test("draws five arrows, takes the arrow keys, scores every trial and completes", async () => {
    const { results, outcomes, emitted } = mount("flanker", {
      n: 4,
      itiMs: [400, 400],
    });
    await pump(50);
    const area = screen.getByRole("img", { name: "Arrows task" });
    expect(area.querySelectorAll("svg[width='56']")).toHaveLength(5);
    expect(emitted.find((e) => e.kind === "stimulus")!.label).toBe(
      "flanker_stimulus_onset"
    );

    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(window, { code: "ArrowLeft" });
      await pump(clock + 600);
    }
    await pump(clock + 3000);
    expect(outcomes()).toHaveLength(4);
    for (const o of outcomes()) {
      expect(["hit", "error"]).toContain(o.outcome);
      expect(o.outcome === "hit").toBe(o.correct_response === "left");
      expect(o.required_action).toBe("press");
    }
    expect(results).toHaveLength(1);
    expect(results[0].taskKind).toBe("flanker");
    expect(results[0].summary).toMatchObject({ n: 4, omissionRate: 0 });
  });

  test("with cues, a star comes before the row and the row leaves fixation", async () => {
    const { emitted } = mount("flanker", {
      n: 8,
      cues: ["spatial"],
      itiMs: [400, 400],
    });
    await pump(60);
    expect(screen.getByText("✱")).toBeInTheDocument();
    expect(emitted.at(-1)).toMatchObject({
      label: "flanker_cue_onset",
      meta: { cue_type: "spatial" },
    });
    await pump(700);
    expect(screen.queryByText("✱")).toBeNull();
    const position = emitted.find((e) => e.label === "flanker_stimulus_onset")!
      .meta!.position;
    expect(["up", "down"]).toContain(position);
  });

  test("feedback is said only when the block asks for it", async () => {
    mount("flanker", { n: 2, itiMs: [900, 900], feedback: true });
    await pump(50);
    fireEvent.pointerDown(screen.getByRole("button", { name: /Left/ }));
    await pump(clock + 100);
    expect(screen.getByText(/Correct|Wrong side/)).toBeInTheDocument();
  });
});

describe("n-back", () => {
  test("shows letters at a fixed pace; space on a match is a hit, silence is scored too", async () => {
    const { results, outcomes } = mount("n-back", {
      n: 8,
      load: 1,
      lureRatio: 0,
      stimulusMs: 200,
      isiMs: 300,
    });
    await pump(50);
    expect(screen.getByText(/^[BFHKMQRX]$/)).toBeInTheDocument();
    await pump(260);
    expect(screen.queryByText(/^[BFHKMQRX]$/)).toBeNull(); // gone, window still open
    fireEvent.keyDown(window, { code: "Space" });
    await pump(8 * 500 + 2500);
    expect(outcomes()).toHaveLength(8);
    const kinds = new Set(outcomes().map((o) => o.outcome));
    expect(
      [...kinds].every((k) =>
        ["hit", "miss", "correct_rejection", "commission_error"].includes(
          String(k)
        )
      )
    ).toBe(true);
    expect(outcomes().every((o) => o.load === 1)).toBe(true);
    expect(results[0].taskKind).toBe("n-back");
  });
});

describe("coding", () => {
  test("the key is on screen, a right digit brings the next symbol, the clock ends it", async () => {
    const { results, outcomes } = mount("coding", {
      duration_s: 3,
      pairs: 4,
      itiMs: 50,
    });
    await pump(50);
    const key = screen.getByRole("table", {
      name: "Which digit goes with which symbol",
    });
    const symbols = [...key.querySelectorAll("tr:first-child td svg")].map(
      (svg) => svg.getAttribute("data-glyph")
    );
    expect(symbols).toHaveLength(4);

    for (let i = 0; i < 3; i++) {
      const shown = screen
        .getByRole("img", { name: "The symbol to answer" })
        .getAttribute("data-symbol");
      const digit = String(symbols.indexOf(shown) + 1);
      fireEvent.keyDown(window, { code: `Digit${digit}` });
      await pump(clock + 200);
    }
    expect(outcomes().map((o) => o.outcome)).toEqual(["hit", "hit", "hit"]);
    await pump(6000);
    expect(results).toHaveLength(1);
    // the symbol left on screen when time ran out is not a miss
    expect(results[0].summary).toMatchObject({
      correct: 3,
      answered: 3,
      duration_s: 3,
    });
  });
});

describe("heartbeat", () => {
  test("tone to tone, then the count and the confidence, once per round", async () => {
    vi.useFakeTimers();
    const { emitted, results } = mount("heartbeat", {
      intervals_s: [10, 12],
      shuffle: false,
      ready_s: 2,
    });
    expect(
      screen.getByText(/start counting your heartbeats/)
    ).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(2100));
    expect(emitted.at(-1)).toMatchObject({
      label: "heartbeat_interval_start",
      kind: "stimulus",
      meta: { interval_index: 0, duration_s: 10, timing_source: "ui" },
    });
    expect(screen.getByText(/until the next tone/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(10_100));
    expect(emitted.at(-1)!.label).toBe("heartbeat_interval_end");

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(emitted.at(-1)).toMatchObject({
      label: "heartbeat_report",
      kind: "response",
      meta: { interval_index: 0, reported_count: 11, confidence: 8 },
    });

    // one act per stage: React sets the next stage's timer only once the act ends
    await act(async () => vi.advanceTimersByTimeAsync(2100));
    await act(async () => vi.advanceTimersByTimeAsync(12_100));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(results).toHaveLength(1);
    expect(results[0].summary.intervals).toHaveLength(2);
  });
});
