import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CHART_THEMES,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  readTheme,
  setTheme,
  trailColorscale,
  trailHexAt,
  useChartTheme,
  useTheme,
} from "./theme";

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

/** MutationObserver callbacks are microtasks; let them run inside act. */
const settle = () => act(() => Promise.resolve());

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("boot script", () => {
  test("applies the stored choice before anything renders", () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("falls back to the system setting when nothing is stored", () => {
    stubMatchMedia(true);
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("useTheme", () => {
  test("reads light when the document carries no theme", () => {
    expect(readTheme()).toBe("light");
  });

  test("setTheme applies, remembers and re-renders", async () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe("light");
    act(() => setTheme("dark"));
    await settle();
    expect(result.current).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  test("follows the system only while no choice is stored", async () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useTheme());
    act(() => media.flip(true));
    await settle();
    expect(result.current).toBe("dark");

    act(() => setTheme("light"));
    await settle();
    act(() => media.flip(true));
    await settle();
    expect(result.current).toBe("light");

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

describe("useChartTheme", () => {
  test("resolves the palette of the applied theme", async () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.trail).toEqual(CHART_THEMES.light.trail);
    expect(result.current.channels).toHaveLength(4);
    act(() => setTheme("dark"));
    await settle();
    expect(result.current.trailEnd).toBe("#ff9cce");
  });
});

describe("trail ramp", () => {
  test("colorscale spans 0..1 with every stop", () => {
    const scale = trailColorscale(CHART_THEMES.dark);
    expect(scale.map(([u]) => u)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(scale[3][1]).toBe("#ff9cce");
  });

  test("the ramp hits its stops and interpolates between them", () => {
    const stops = ["#000000", "#ffffff", "#ff0000"];
    expect(trailHexAt(stops, 0)).toBe("#000000");
    expect(trailHexAt(stops, 0.25)).toBe("#808080");
    expect(trailHexAt(stops, 1)).toBe("#ff0000");
  });

  test("the ramp clamps out-of-range and non-finite input", () => {
    const stops = ["#000000", "#ffffff"];
    expect(trailHexAt(stops, -3)).toBe("#000000");
    expect(trailHexAt(stops, 7)).toBe("#ffffff");
    expect(trailHexAt(stops, Number.NaN)).toBe("#000000");
  });

  test("trailHexAt returns the stops as hex at their positions", () => {
    const stops = ["#f9ba4a", "#60d8e8", "#a082ee", "#ff9cce"];
    expect(trailHexAt(stops, 0)).toBe("#f9ba4a");
    expect(trailHexAt(stops, 1)).toBe("#ff9cce");
    expect(trailHexAt(["#000000", "#ffffff"], 0.5)).toBe("#808080");
  });
});
