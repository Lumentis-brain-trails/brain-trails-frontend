"use client";

import { useSyncExternalStore } from "react";

/**
 * Appearance (light or dark) and the palette canvas-based charts need.
 *
 * The source of truth is `data-theme` on <html>: the inline script in
 * `app/layout.tsx` sets it before first paint (the stored choice, else the system
 * setting), `setTheme` flips it and remembers the choice. Until the user picks one,
 * the page keeps following the system setting live.
 */
export type ThemeName = "light" | "dark";

/** localStorage key of an explicit choice; absent means "follow the system". */
export const THEME_STORAGE_KEY = "bt-theme";

/**
 * Runs in <head> before the body paints, so a dark page never flashes white.
 * Kept as a string because it must not wait for the bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

function storedTheme(): ThemeName | null {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** The appearance currently applied to the document ("light" on the server). */
export function readTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Apply an appearance and remember it as the user's explicit choice. */
export function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode or blocked storage: the choice lasts for this page only
  }
}

/**
 * Notify `onChange` whenever the applied appearance changes, from any source: the
 * toggle, another component, or the system setting while no choice is stored.
 */
export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const followSystem = () => {
    if (storedTheme() === null)
      document.documentElement.dataset.theme = mq?.matches ? "dark" : "light";
  };
  mq?.addEventListener("change", followSystem);
  return () => {
    observer.disconnect();
    mq?.removeEventListener("change", followSystem);
  };
}

/** The applied appearance, re-rendering when it changes. */
export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}

/**
 * Resolved design tokens for canvas-based charts (Plotly, uPlot, three.js) that
 * cannot read CSS variables themselves. Mirrors globals.css.
 */
export interface ChartTheme {
  /** Page ground, and the text colour on an `ink` hover label. */
  canvas: string;
  ink: string;
  ink3: string;
  hairline: string;
  /**
   * Energy surfaces, neutral so colour stays with the trail: `fill` for the flat
   * contour, `low`/`high` for a basin and a ridge of the 3D terrain, `line` for its
   * contour lines.
   */
  terrain: { fill: string; low: string; high: string; line: string };
  /** The trail's time ramp, first window to last: the ribbons' four stops. */
  trail: readonly [string, string, string, string];
  trailStart: string;
  trailEnd: string;
  /** One colour per EEG channel (TP9, AF7, AF8, TP10). */
  channels: string[];
}

const LIGHT_TRAIL = ["#e8a02a", "#1bafc4", "#7c5ce6", "#e2569c"] as const;
const DARK_TRAIL = ["#f9ba4a", "#60d8e8", "#a082ee", "#ff9cce"] as const;

export const CHART_THEMES: Record<ThemeName, ChartTheme> = {
  light: {
    canvas: "#fbfbfd",
    ink: "#1d1d1f",
    ink3: "#86868b",
    hairline: "rgba(0,0,0,0.08)",
    terrain: {
      fill: "rgba(29,29,31,0.28)",
      low: "#c4c8d1",
      high: "#f5f5f7",
      line: "#a3a9b5",
    },
    trail: LIGHT_TRAIL,
    trailStart: LIGHT_TRAIL[0],
    trailEnd: LIGHT_TRAIL[3],
    channels: [...LIGHT_TRAIL],
  },
  dark: {
    canvas: "#07090e",
    ink: "#f5f5f7",
    ink3: "#7c8497",
    hairline: "rgba(255,255,255,0.08)",
    terrain: {
      fill: "rgba(241,244,250,0.3)",
      low: "#0b0e14",
      high: "#3a4252",
      line: "#56607a",
    },
    trail: DARK_TRAIL,
    trailStart: DARK_TRAIL[0],
    trailEnd: DARK_TRAIL[3],
    channels: [...DARK_TRAIL],
  },
};

export function useChartTheme(): ChartTheme {
  return CHART_THEMES[useTheme()];
}

/** The trail ramp as a Plotly colorscale: four evenly spaced stops. */
export function trailColorscale(theme: ChartTheme): [number, string][] {
  return theme.trail.map((c, i) => [i / (theme.trail.length - 1), c]);
}

/**
 * The trail colour at `u` in [0, 1] (clamped), as sRGB fractions in [0, 1]:
 * a piecewise-linear walk through the four stops, for renderers that colour one
 * vertex at a time (three.js).
 */
export function trailColorAt(
  stops: readonly string[],
  u: number
): [number, number, number] {
  const t = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0));
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/** `trailColorAt` as a `#rrggbb` string, for SVG and CSS. */
export function trailHexAt(stops: readonly string[], u: number): string {
  return `#${trailColorAt(stops, u)
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
