import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useChartTheme } from "./theme";

/** matchMedia stub whose `change` listeners can be fired by the test. */
function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => mq);
  return {
    flip(next: boolean) {
      mq.matches = next;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useChartTheme", () => {
  test("resolves the light palette by default", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.trail1).toBe("#0071e3");
    expect(result.current.channels).toHaveLength(4);
  });

  test("follows the colour scheme and unsubscribes on unmount", () => {
    const media = stubMatchMedia(true);
    const { result, unmount } = renderHook(() => useChartTheme());
    expect(result.current.trail1).toBe("#2997ff");
    act(() => media.flip(false));
    expect(result.current.trail1).toBe("#0071e3");
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
