"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { api } from "@/lib/api";
import { useChartTheme } from "@/lib/theme";
import type { SignalPreview as SignalData } from "@/lib/types";
import { Segmented, Skeleton } from "@/components/ui";

const WINDOW_S = 30;

/**
 * Thirty-second window of the four channels, stacked with a vertical offset.
 * The scrubber moves the window; the segmented control switches between the
 * cleaned signal and the standardized (pre-cleaning) one.
 */
export function SignalPreview({
  recordingId,
  durationS,
}: {
  recordingId: string;
  durationS: number;
}) {
  const [start, setStart] = useState(0);
  const [stage, setStage] = useState<"std" | "clean">("clean");
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const theme = useChartTheme();

  const signal = useQuery({
    queryKey: ["signal", recordingId, stage, start],
    queryFn: () =>
      api.get<SignalData>(
        `recordings/${recordingId}/signal?start=${start}&duration=${WINDOW_S}&stage=${stage}`
      ),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!signal.data || !containerRef.current) return;
    const { samples, sfreq, ch_names, t0 } = signal.data;
    const n = samples[0]?.length ?? 0;
    const times = Array.from({ length: n }, (_, i) => t0 + i / sfreq);
    const spread = Math.max(
      ...samples.map((row) => Math.max(...row.map(Math.abs))),
      1
    );
    const data: uPlot.AlignedData = [
      times,
      ...samples.map((row, ch) =>
        row.map((v) => v + (samples.length - 1 - ch) * spread * 2.2)
      ),
    ];
    const el = containerRef.current;
    plotRef.current?.destroy();
    plotRef.current = new uPlot(
      {
        width: el.clientWidth,
        height: 260,
        scales: { x: { time: false } },
        series: [
          {},
          ...ch_names.map((name, i) => ({
            label: name,
            stroke: theme.channels[i % theme.channels.length],
            width: 1,
          })),
        ],
        axes: [
          {
            stroke: theme.ink3,
            values: (_u: uPlot, ticks: number[]) =>
              ticks.map((t) => `${Math.round(t)} s`),
            grid: { stroke: theme.hairline, width: 1 },
            ticks: { stroke: theme.hairline, width: 1 },
            font: "11px -apple-system, system-ui",
          },
          { show: false },
        ],
        legend: { live: false },
        cursor: { y: false },
      },
      data,
      el
    );
    const ro = new ResizeObserver(() =>
      plotRef.current?.setSize({ width: el.clientWidth, height: 260 })
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
    };
  }, [signal.data, theme]);

  const maxStart = Math.max(0, Math.floor(durationS - WINDOW_S));
  const end = Math.min(start + WINDOW_S, Math.round(durationS));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Signal stage"
          value={stage}
          onChange={setStage}
          options={[
            { value: "clean", label: "Cleaned" },
            { value: "std", label: "Standardized" },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="type-caption text-ink-3 tabular-nums">
            {start}–{end} s
          </span>
          <input
            type="range"
            min={0}
            max={maxStart}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            aria-label="Window start"
            className="w-40 accent-(--accent)"
          />
        </div>
      </div>
      {signal.isLoading && <Skeleton className="h-[260px]" />}
      {signal.isError && (
        <p className="text-[14px] text-ink-3">Signal not available.</p>
      )}
      <div
        ref={containerRef}
        className="transition-opacity duration-(--m-fast)"
        style={{ opacity: signal.isFetching ? 0.6 : 1 }}
      />
    </div>
  );
}
