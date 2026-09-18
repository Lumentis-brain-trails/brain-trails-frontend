"use client";

import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  EEG_CHANNELS,
  SAMPLE_RATE_HZ,
  type EegChannel,
} from "@/lib/muse/protocol";
import { useChartTheme } from "@/lib/theme";

const WINDOW_S = 10;
const FRAME_MS = 100;

/**
 * Scrolling ten-second view of the four raw channels, stacked with a fixed
 * vertical offset so a noisy electrode does not squash the others. Redraws
 * ten times a second from the hook's ring buffers; nothing here re-renders
 * React.
 */
export function LiveSignal({
  getRecent,
  active,
}: {
  getRecent: (seconds: number) => Record<EegChannel, Float32Array>;
  active: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const theme = useChartTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const spread = 150; // µV between stacked channels
    plotRef.current?.destroy();
    plotRef.current = new uPlot(
      {
        width: el.clientWidth,
        height: 260,
        cursor: { show: false },
        legend: { show: false },
        scales: {
          x: { time: false },
          y: { range: [-spread, spread * EEG_CHANNELS.length] },
        },
        axes: [
          {
            stroke: theme.ink3,
            grid: { stroke: theme.hairline },
            ticks: { stroke: theme.hairline },
          },
          { show: false },
        ],
        series: [
          {},
          ...EEG_CHANNELS.map((_, i) => ({
            stroke: theme.channels[i],
            width: 1,
            points: { show: false },
          })),
        ],
      },
      [[], ...EEG_CHANNELS.map(() => [])] as unknown as uPlot.AlignedData,
      el
    );
    const onResize = () =>
      plotRef.current?.setSize({ width: el.clientWidth, height: 260 });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    if (!active) return;
    const spread = 150;
    const id = setInterval(() => {
      const recent = getRecent(WINDOW_S);
      const n = recent.TP9.length;
      const times = Array.from(
        { length: n },
        (_, i) => (i - n) / SAMPLE_RATE_HZ
      );
      const rows = EEG_CHANNELS.map((c, ch) => {
        const row = recent[c];
        const out = new Array<number>(n);
        const offset = (EEG_CHANNELS.length - 1 - ch) * spread;
        for (let i = 0; i < n; i++) out[i] = row[i] + offset;
        return out;
      });
      plotRef.current?.setData([times, ...rows]);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [active, getRecent]);

  return (
    <div>
      <div ref={containerRef} className="min-h-[260px]" />
      <div className="flex flex-wrap gap-4 px-1 pt-2">
        {EEG_CHANNELS.map((c, i) => (
          <span
            key={c}
            className="type-caption inline-flex items-center gap-1.5 text-ink-3"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: theme.channels[i] }}
            />
            {c}
          </span>
        ))}
        <span className="type-caption ml-auto text-ink-3">
          last {WINDOW_S} s · {SAMPLE_RATE_HZ} Hz
        </span>
      </div>
    </div>
  );
}
