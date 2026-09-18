"use client";

import { useEffect, useState } from "react";

/**
 * Resolved design tokens for canvas-based charts (Plotly, uPlot) that cannot
 * read CSS variables themselves. Re-reads when the colour scheme flips.
 */
export interface ChartTheme {
  ink: string;
  ink3: string;
  hairline: string;
  trail0: string;
  trail1: string;
  trailStart: string;
  trailEnd: string;
  channels: string[];
}

const LIGHT: ChartTheme = {
  ink: "#1d1d1f",
  ink3: "#86868b",
  hairline: "rgba(0,0,0,0.08)",
  trail0: "#d2d2d7",
  trail1: "#0071e3",
  trailStart: "#248a3d",
  trailEnd: "#d70015",
  channels: ["#0071e3", "#30b0c7", "#5e5ce6", "#8e8e93"],
};

const DARK: ChartTheme = {
  ink: "#f5f5f7",
  ink3: "#86868b",
  hairline: "rgba(255,255,255,0.1)",
  trail0: "#48484a",
  trail1: "#2997ff",
  trailStart: "#30d158",
  trailEnd: "#ff453a",
  channels: ["#2997ff", "#40c8e0", "#7d7aff", "#98989d"],
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(LIGHT);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? DARK : LIGHT);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}
