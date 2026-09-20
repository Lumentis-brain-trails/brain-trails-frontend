import { renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useFocusMode } from "./focus";

const focused = () => document.documentElement.dataset.focus === "true";

test("sets the flag while active and clears it after", () => {
  const { rerender, unmount } = renderHook(({ on }) => useFocusMode(on), {
    initialProps: { on: false },
  });
  expect(focused()).toBe(false);
  rerender({ on: true });
  expect(focused()).toBe(true);
  rerender({ on: false });
  expect(focused()).toBe(false);
  unmount();
});

test("keeps focus until every holder releases it", () => {
  const a = renderHook(() => useFocusMode(true));
  const b = renderHook(() => useFocusMode(true));
  a.unmount();
  expect(focused()).toBe(true);
  b.unmount();
  expect(focused()).toBe(false);
});
