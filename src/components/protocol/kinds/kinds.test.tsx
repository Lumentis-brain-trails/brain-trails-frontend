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

/** Render one kind the way the runner does: parsed config, spies for emit/complete. */
function mount(kind: string, config: unknown) {
  const emitted: { draft: MarkerDraft; at?: number }[] = [];
  const results: TaskResult[] = [];
  const { Renderer, configSchema } = getTaskKind(kind);
  const parsed = configSchema.parse(config);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Renderer
        config={parsed as never}
        stepId="s1"
        phase="s1"
        seed={1}
        emit={(draft, at) => emitted.push({ draft, at })}
        onComplete={(r) => results.push(r)}
        reducedMotion={false}
      />
    </NextIntlClientProvider>
  );
  const labels = () => emitted.map((e) => e.draft.label);
  return { emitted, results, labels };
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("S18 kinds", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("instructions is the prompt renderer under the tree's name", () => {
    expect(getTaskKind("instructions").Renderer).toBe(
      getTaskKind("prompt").Renderer
    );
    const { results } = mount("instructions", {
      lines: [{ text: "Welcome" }],
      advance: { mode: "key" },
    });
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(results).toHaveLength(1);
  });

  test("fixation shows a cross and ends after its duration", async () => {
    const { results } = mount("fixation", { duration_s: 1.5 });
    expect(screen.getByRole("img", { name: "Fixation cross" })).toBeVisible();
    await advance(1400);
    expect(results).toHaveLength(0);
    await advance(200);
    expect(results[0]).toMatchObject({
      stepId: "s1",
      taskKind: "fixation",
      summary: { duration_s: 1.5 },
    });
  });

  test("baseline eyes open: cross and instruction, ends on time", async () => {
    const { results } = mount("baseline", { duration_s: 60 });
    expect(screen.getByRole("img", { name: "Fixation cross" })).toBeVisible();
    expect(screen.getByText(/Keep your eyes open/)).toBeInTheDocument();
    await advance(60_000);
    expect(results[0].summary).toEqual({ eyes: "open", duration_s: 60 });
  });

  test("baseline eyes closed: no cross, a tone promise, then the end", async () => {
    const { results } = mount("baseline", { eyes: "closed", duration_s: 2 });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/A tone will tell you/)).toBeInTheDocument();
    await advance(2000);
    // jsdom has no Web Audio: the step still ends, silently.
    expect(results[0].summary).toEqual({ eyes: "closed", duration_s: 2 });
  });

  test("baseline eyes closed plays the end tone and marks it", async () => {
    const osc = {
      frequency: { value: 0 },
      connect: vi.fn((node: unknown) => node),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    const gainNode = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    osc.connect = vi.fn(() => gainNode);
    class FakeAudioContext {
      currentTime = 1;
      sampleRate = 48000;
      destination = {};
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
      createOscillator = () => osc;
      createGain = () => gainNode;
      getOutputTimestamp = () => ({ contextTime: 1, performanceTime: 1000 });
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { emitted, results } = mount("baseline", {
      eyes: "closed",
      duration_s: 1,
    });
    await advance(1000);
    expect(osc.start).toHaveBeenCalledWith(1.02);
    expect(emitted[0].draft).toMatchObject({
      label: "baseline_end_tone",
      meta: { timing_source: "webaudio" },
    });
    expect(emitted[0].at).toBeCloseTo(1020);
    expect(results).toHaveLength(1);
  });

  test("rest timed ends on time; self-paced counts up and ends on Finish", async () => {
    const timed = mount("rest", { duration_s: 5, message: "Breathe." });
    expect(screen.getByText("Breathe.")).toBeInTheDocument();
    await advance(5000);
    expect(timed.results[0].summary).toEqual({ mode: "timed", duration_s: 5 });
    cleanup();

    const free = mount("rest", { mode: "self_paced" });
    await advance(65_000);
    expect(screen.getByText("Elapsed 1:05")).toBeInTheDocument();
    expect(free.results).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(free.results[0].summary).toEqual({
      mode: "self_paced",
      elapsed_s: 65,
    });
  });

  test("countdown counts down one per second, then ends", async () => {
    const { results } = mount("countdown", { from: 3 });
    expect(screen.getByText("3")).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("2")).toBeInTheDocument();
    await advance(2000);
    expect(results[0].summary).toEqual({ from: 3 });
  });

  test("audio without Web Audio offers a way on instead of hanging", async () => {
    const { results } = mount("audio", { src: "https://x/a.mp3" });
    await advance(0);
    expect(screen.getByText(/could not be played/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(results[0].summary).toEqual({ error: true });
  });

  test("text: onset on the first frame, Continue after min_s, offset on Continue", async () => {
    const { emitted, results, labels } = mount("text", {
      body: "First paragraph.\n\nSecond paragraph.",
      min_s: 2,
      media_id: "00000000-0000-0000-0000-000000000009",
    });
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
    await advance(20);
    expect(emitted[0].draft).toMatchObject({
      label: "stimulus_onset",
      meta: {
        timing_source: "raf",
        media_id: "00000000-0000-0000-0000-000000000009",
      },
    });
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    await advance(2000);
    fireEvent.click(button);
    expect(labels()).toEqual(["stimulus_onset", "stimulus_offset"]);
    expect(results).toHaveLength(1);
  });

  test("text loads a bound media src, and admits when it cannot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Loaded text.", { status: 200 }))
    );
    mount("text", { src: "https://x/t.txt" });
    await advance(0);
    expect(screen.getByText("Loaded text.")).toBeInTheDocument();
    cleanup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    );
    const failed = mount("text", { src: "https://x/t.txt" });
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(failed.results[0].summary).toEqual({ error: true });
  });

  test("SAM: three 9-point scales; one answer marker per item on submit", () => {
    const { emitted, results } = mount("questionnaire", { instrument: "sam" });
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(3);
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getAllByRole("radio", { name: "7 of 9" })[0]);
    fireEvent.click(screen.getAllByRole("radio", { name: "3 of 9" })[1]);
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio", { name: "5 of 9" })[2]);
    fireEvent.click(submit);

    expect(emitted.map((e) => e.draft.meta)).toEqual([
      { instrument: "sam", item_id: "valence", item_index: 0, value: 7 },
      { instrument: "sam", item_id: "arousal", item_index: 1, value: 3 },
      { instrument: "sam", item_id: "dominance", item_index: 2, value: 5 },
    ]);
    expect(emitted.every((e) => e.draft.label === "questionnaire_answer")).toBe(
      true
    );
    expect(results[0].summary).toEqual({
      instrument: "sam",
      answers: { valence: 7, arousal: 3, dominance: 5 },
    });
  });

  test("NASA-TLX: six sliders, each must be moved", () => {
    const { results } = mount("questionnaire", { instrument: "nasa_tlx" });
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(6);
    sliders
      .slice(0, 5)
      .forEach((s) => fireEvent.change(s, { target: { value: "40" } }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.change(sliders[5], { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(results[0].summary).toMatchObject({
      instrument: "nasa_tlx",
      answers: { mental: 40, frustration: 90 },
    });
  });

  test("VAS and custom items: slider, likert and choice", () => {
    const vas = mount("questionnaire", {
      instrument: "vas",
      items: [{ id: "calm", text: "How calm?", anchors: ["Not", "Very"] }],
    });
    expect(screen.getByText("Very")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "How calm?" }), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(vas.results[0].summary).toEqual({
      instrument: "vas",
      answers: { calm: 12 },
    });
    cleanup();

    const custom = mount("questionnaire", {
      instrument: "custom",
      prompt: "About you",
      items: [
        { id: "mood", text: "Mood?", type: "likert", points: 5 },
        { id: "pet", text: "Pet?", type: "choice", choices: ["Cat", "Dog"] },
      ],
    });
    expect(screen.getByText("About you")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "4 of 5" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dog" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(custom.emitted[1].draft.meta).toMatchObject({
      item_id: "pet",
      value: 2,
      choice_label: "Dog",
    });
  });

  test("quiz: onset per scene, response with correctness and RT, feedback", async () => {
    const { emitted, results } = mount("quiz", {
      feedback: true,
      scenes: [
        { prompt: "2+2?", choices: ["3", "4"], correct: 1 },
        { prompt: "Favourite?", choices: ["Red", "Blue"] },
      ],
    });
    await advance(20);
    expect(emitted[0].draft).toMatchObject({
      label: "stimulus_onset",
      meta: { scene_index: 0, timing_source: "raf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(emitted[1].draft).toMatchObject({
      label: "response",
      kind: "response",
      meta: { scene_index: 0, choice_index: 1, correct: true },
    });
    expect(typeof emitted[1].draft.meta?.reaction_time_ms).toBe("number");
    expect(screen.getByText("Correct")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    await advance(20);
    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(results[0].summary).toMatchObject({ score: 1, scored: 1 });
    expect(emitted.map((e) => e.draft.label)).toEqual([
      "stimulus_onset",
      "response",
      "stimulus_onset",
      "response",
    ]);
  });

  test("video: onset on playing without rVFC, offset and end on ended", () => {
    const { emitted, results, labels } = mount("video", {
      src: "https://x/v.mp4",
    });
    const video = document.querySelector("video")!;
    fireEvent(video, new Event("playing"));
    expect(emitted[0].draft).toMatchObject({
      label: "stimulus_onset",
      meta: { timing_source: "ui" },
    });
    fireEvent(video, new Event("ended"));
    expect(labels()).toEqual(["stimulus_onset", "ended", "stimulus_offset"]);
    expect(results).toHaveLength(1);
  });

  test("video: requestVideoFrameCallback stamps the presented frame", () => {
    const proto = HTMLVideoElement.prototype as unknown as Record<
      string,
      unknown
    >;
    let callback: ((now: number, m: object) => void) | null = null;
    proto.requestVideoFrameCallback = (cb: typeof callback) => {
      callback = cb;
      return 1;
    };
    proto.cancelVideoFrameCallback = () => {};
    try {
      const { emitted } = mount("video", { src: "https://x/v.mp4" });
      act(() =>
        callback!(0, {
          presentationTime: 1234,
          expectedDisplayTime: 1238,
          mediaTime: 0,
        })
      );
      expect(emitted[0]).toMatchObject({
        at: 1234,
        draft: {
          label: "stimulus_onset",
          meta: { timing_source: "rvfc", timing_uncertainty_ms: 4 },
        },
      });
    } finally {
      delete proto.requestVideoFrameCallback;
      delete proto.cancelVideoFrameCallback;
    }
  });

  test("video accepts a bound media_id config and rejects neither src nor id", () => {
    const schema = getTaskKind("video").configSchema;
    expect(
      schema.safeParse({ media_id: "00000000-0000-0000-0000-000000000001" })
        .success
    ).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("breathing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("moves on to breathe out while the host re-renders with new callbacks", async () => {
    // A new `emit`/`onComplete` every second (a streaming headband) used to restart the
    // exercise from zero: the participant stayed on "Breathe in" for good.
    const { Renderer, configSchema } = getTaskKind("breathing");
    const config = configSchema.parse({
      cycles: 2,
      inhaleMs: 1500,
      exhaleMs: 1500,
    });
    const labels: string[] = [];
    const results: TaskResult[] = [];
    const view = () => (
      <Renderer
        config={config as never}
        stepId="s1"
        phase="s1"
        seed={1}
        emit={(draft) => labels.push(draft.label)}
        onComplete={(r) => results.push(r)}
        reducedMotion={false}
      />
    );
    const { rerender } = render(view());
    for (let i = 0; i < 10; i++) {
      await advance(700);
      rerender(view());
    }

    expect(screen.queryByText("Breathe out")).not.toBeNull();
    expect(labels.filter((l) => l === "breath_exhale")).toHaveLength(2);
    expect(results).toHaveLength(1);
  });
});
