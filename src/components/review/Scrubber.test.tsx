import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunBlock } from "@/lib/review/timeline";
import { Scrubber } from "./Scrubber";

afterEach(() => cleanup());

const blocks: RunBlock[] = [
  {
    blockId: "base",
    label: "Resting baseline",
    kind: "baseline",
    tStart: 0,
    tEnd: 60,
  },
  { blockId: "clip", label: "Calm sea", kind: "video", tStart: 60, tEnd: 120 },
];

/** jsdom gives every element a zero-sized box, so the bar needs one to map pixels. */
function withWidth(width = 200) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 20,
    width,
    height: 20,
    toJSON: () => "",
  });
}

function setup(overrides: Partial<Parameters<typeof Scrubber>[0]> = {}) {
  const onSeek = vi.fn();
  const onRange = vi.fn();
  render(
    <Scrubber
      duration={120}
      t={0}
      blocks={blocks}
      ticks={[{ t: 61, type: "stimulus_onset" }]}
      range={null}
      onSeek={onSeek}
      onRange={onRange}
      {...overrides}
    />
  );
  return { onSeek, onRange, bar: screen.getByRole("slider") };
}

test("dragging the bar seeks to the time under the pointer", () => {
  withWidth();
  const { onSeek, bar } = setup();
  Object.assign(bar, { setPointerCapture: vi.fn() });
  fireEvent.pointerDown(bar, { clientX: 100, buttons: 1 });
  expect(onSeek).toHaveBeenLastCalledWith(60); // half of 120 s
});

test("shift-dragging brushes a stretch instead of seeking", () => {
  withWidth();
  const { onSeek, onRange, bar } = setup();
  Object.assign(bar, { setPointerCapture: vi.fn() });
  fireEvent.pointerDown(bar, { clientX: 50, buttons: 1, shiftKey: true });
  fireEvent.pointerMove(bar, { clientX: 150, buttons: 1 });
  expect(onSeek).not.toHaveBeenCalled();
  expect(onRange).toHaveBeenLastCalledWith([30, 90]);
});

test("the blocks are on the bar, and clicking one goes to its start", () => {
  withWidth();
  const { onSeek } = setup();
  fireEvent.click(screen.getByTitle("Calm sea"));
  expect(onSeek).toHaveBeenLastCalledWith(60);
});

test("the arrows step through the session", () => {
  withWidth();
  const { onSeek, bar } = setup({ t: 10 });
  fireEvent.keyDown(bar, { key: "ArrowRight" });
  expect(onSeek).toHaveBeenLastCalledWith(11);
  fireEvent.keyDown(bar, { key: "ArrowLeft", shiftKey: true });
  expect(onSeek).toHaveBeenLastCalledWith(0);
});
