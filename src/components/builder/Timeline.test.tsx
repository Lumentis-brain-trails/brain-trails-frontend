import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import type { BlockNode, ProtocolTree } from "@/lib/protocol/tree";
import { clips as clipsOf } from "@/lib/builder/draft";
import { DRAG_TYPE, Timeline } from "./Timeline";

afterEach(() => cleanup());

const block = (id: string, seconds: number): BlockNode =>
  ({
    type: "block",
    id,
    kind: "rest",
    label: id,
    config: { mode: "timed", duration_s: seconds },
  }) as BlockNode;

const tree: ProtocolTree = {
  schema: 1,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: {
    type: "sequence",
    order: "fixed",
    children: [block("first", 60), block("second", 30)],
  },
  soundtrack: [],
};

function setup(children = tree.root.children) {
  const onDropAt = vi.fn();
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Timeline
        clips={clipsOf({ ...tree, root: { ...tree.root, children } })}
        selected={[0]}
        zoom={1}
        issues={{ 1: { errors: 2, warnings: 0 } }}
        onSelect={onSelect}
        onDropAt={onDropAt}
        onOpenGroup={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  return { onDropAt, onSelect };
}

/** jsdom has no DataTransfer, so the tests carry the payload themselves. */
function transfer(payload: unknown) {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? JSON.stringify(payload),
    effectAllowed: "",
  };
}

test("a clip is as wide as it lasts, and carries its own label", () => {
  setup();
  const first = screen.getByText("first").closest("[role=listitem]");
  const second = screen.getByText("second").closest("[role=listitem]");
  expect(first).toBeTruthy();
  const width = (node: Element | null) =>
    Number((node as HTMLElement).style.width.replace("px", ""));
  expect(width(first)).toBeGreaterThan(width(second));
});

test("dropping media from the bin reports where it landed", () => {
  const { onDropAt } = setup();
  const gap = screen.getByTestId("gap-1");
  fireEvent.drop(gap, {
    dataTransfer: transfer({ from: "bin-media", value: "m1" }),
  });
  expect(onDropAt).toHaveBeenCalledWith(1, { from: "bin-media", value: "m1" });
});

test("dragging a clip carries its index, and selecting reports the modifier", () => {
  const { onSelect } = setup();
  const handle = screen.getByText("second").closest("button")!;
  const dataTransfer = transfer(null);
  fireEvent.dragStart(handle, { dataTransfer });
  expect(dataTransfer.getData(DRAG_TYPE)).toBe(
    JSON.stringify({ from: "timeline", value: 1 })
  );
  fireEvent.click(handle, { shiftKey: true });
  expect(onSelect).toHaveBeenCalledWith(1, true);
});

test("a clip with errors shows how many", () => {
  setup();
  expect(screen.getByLabelText("2 errors")).toBeTruthy();
});

/**
 * Alessio, 2026-09-20: dropping a video on an empty timeline did nothing, because the
 * only drop target was the thin gap hidden behind the "drag something here" line.
 */
test("the whole strip takes a drop, empty timeline included", () => {
  const { onDropAt } = setup([]);
  const strip = screen.getByTestId("timeline");
  fireEvent.dragOver(strip, { clientX: 10 });
  fireEvent.drop(strip, {
    clientX: 10,
    dataTransfer: transfer({ from: "bin-media", value: "m1" }),
  });
  expect(onDropAt).toHaveBeenCalledWith(0, { from: "bin-media", value: "m1" });
});

test("a drop past the last clip lands at the end", () => {
  const { onDropAt } = setup();
  const strip = screen.getByTestId("timeline");
  // jsdom gives every box zero width at x=0, so a pointer to the right is past them all
  fireEvent.drop(strip, {
    clientX: 900,
    dataTransfer: transfer({ from: "bin-element", value: "rest" }),
  });
  expect(onDropAt).toHaveBeenCalledWith(2, {
    from: "bin-element",
    value: "rest",
  });
});
