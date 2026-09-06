"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { api } from "@/lib/api";
import type { SignalPreview as SignalData } from "@/lib/types";
import { Button } from "@/components/ui";

const COLORS = ["#6366f1", "#16a34a", "#ea580c", "#0891b2"];
const WINDOW_S = 30;

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

  const signal = useQuery({
    queryKey: ["signal", recordingId, stage, start],
    queryFn: () =>
      api.get<SignalData>(
        `recordings/${recordingId}/signal?start=${start}&duration=${WINDOW_S}&stage=${stage}`
      ),
  });

  useEffect(() => {
    if (!signal.data || !containerRef.current) return;
    const { samples, sfreq, ch_names, t0 } = signal.data;
    const n = samples[0]?.length ?? 0;
    const times = Array.from({ length: n }, (_, i) => t0 + i / sfreq);
    // stack channels with a vertical offset so all four are readable
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
    plotRef.current?.destroy();
    plotRef.current = new uPlot(
      {
        width: containerRef.current.clientWidth,
        height: 280,
        series: [
          {},
          ...ch_names.map((name, i) => ({
            label: name,
            stroke: COLORS[i % COLORS.length],
            width: 1,
          })),
        ],
        axes: [{ label: "time (s)" }, { show: false }],
        legend: { live: false },
        cursor: { y: false },
      },
      data,
      containerRef.current
    );
    return () => plotRef.current?.destroy();
  }, [signal.data]);

  const maxStart = Math.max(0, Math.floor(durationS - WINDOW_S));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["clean", "std"] as const).map((s) => (
            <Button
              key={s}
              variant={stage === s ? "primary" : "ghost"}
              className="px-2 py-1 text-xs"
              onClick={() => setStage(s)}
            >
              {s === "clean" ? "cleaned" : "standardized"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>
            {start}-{Math.min(start + WINDOW_S, Math.round(durationS))} s
          </span>
          <input
            type="range"
            min={0}
            max={maxStart}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            aria-label="window start"
          />
        </div>
      </div>
      {signal.isLoading && (
        <p className="text-sm text-neutral-400">Loading signal...</p>
      )}
      {signal.isError && (
        <p className="text-sm text-red-500">Signal not available.</p>
      )}
      <div ref={containerRef} />
    </div>
  );
}
