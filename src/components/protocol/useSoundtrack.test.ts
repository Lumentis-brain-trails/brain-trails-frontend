import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MarkerDraft } from "@/lib/protocol/marker";
import type { PlannedCue } from "@/lib/protocol/types";
import { useSoundtrack } from "./useSoundtrack";

/** A stand-in for HTMLAudioElement: records what the hook asked of it. */
class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  loop = false;
  volume = 1;
  paused = true;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener() {}
  removeAttribute() {}
  load() {}
}

const cue = (over: Partial<PlannedCue>): PlannedCue => ({
  id: "c",
  media_id: "m",
  src: "https://s3/c.mp3",
  startStep: null,
  offsetS: 0,
  stop: { kind: "protocol_end" },
  loop: false,
  volume: 0.5,
  fadeS: 0,
  ...over,
});

/** Let the start timer fire and the play() promise settle. */
async function tick(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    vi.advanceTimersByTime(20);
  });
}

describe("the soundtrack while a run plays", () => {
  let markers: MarkerDraft[];
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.made = [];
    markers = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16)
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const run = (cues: PlannedCue[], stepIndex = 0, running = true) =>
    renderHook(
      (props: { stepIndex: number; running: boolean }) =>
        useSoundtrack({
          cues,
          stepIndex: props.stepIndex,
          running: props.running,
          emit: (d) => markers.push(d),
        }),
      { initialProps: { stepIndex, running } }
    );

  test("nothing plays before the run starts", async () => {
    run([cue({})], 0, false);
    await tick();
    expect(FakeAudio.made).toHaveLength(0);
  });

  test("background music starts with the run, at its volume, and loops", async () => {
    run([cue({ loop: true, volume: 0.3 })]);
    await tick();
    const [audio] = FakeAudio.made;
    expect(audio.paused).toBe(false);
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBeCloseTo(0.3);
    expect(markers.map((m) => m.label)).toEqual(["sound_start"]);
  });

  test("a sound anchored to a step waits for it, and honours its delay", async () => {
    const { rerender } = run([cue({ startStep: 1, offsetS: 2 })]);
    await tick();
    expect(FakeAudio.made).toHaveLength(0);
    rerender({ stepIndex: 1, running: true });
    await tick(1000);
    expect(FakeAudio.made).toHaveLength(0); // still inside its two-second delay
    await tick(1500);
    expect(FakeAudio.made).toHaveLength(1);
  });

  test("a sound stops as its stop step completes", async () => {
    const { rerender } = run([cue({ stop: { kind: "step", step: 1 } })]);
    await tick();
    rerender({ stepIndex: 1, running: true });
    await tick();
    expect(FakeAudio.made[0].paused).toBe(false); // still inside its stop step
    rerender({ stepIndex: 2, running: true });
    await tick();
    expect(FakeAudio.made[0].paused).toBe(true);
    expect(markers.map((m) => m.label)).toEqual(["sound_start", "sound_stop"]);
  });

  test("stopAll ends everything, including a sound still waiting for its delay", async () => {
    const { result } = run([cue({ id: "a" }), cue({ id: "b", offsetS: 30 })]);
    await tick();
    act(() => result.current.stopAll());
    await tick(60_000);
    expect(FakeAudio.made).toHaveLength(1); // "b" never got to start
    expect(FakeAudio.made[0].paused).toBe(true);
  });

  test("nothing keeps playing once the runner is gone", async () => {
    const { unmount } = run([cue({ loop: true })]);
    await tick();
    unmount();
    expect(FakeAudio.made[0].paused).toBe(true);
  });
});
