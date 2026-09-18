"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { NeuroMetrics, Recording } from "@/lib/types";
import {
  BallMapperGraph,
  colouringLabel,
  type NodeColouring,
} from "@/components/BallMapperGraph";
import { MetricCurve } from "@/components/MetricCurve";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  KeyValue,
  SectionTitle,
  Segmented,
  Skeleton,
  Stat,
} from "@/components/ui";

/** Three minutes at one window per second; mirrors MIN_WINDOWS in the backend. */
const MIN_DURATION_S = 180;

function seconds(value: number | null | undefined): string {
  if (value == null) return "–";
  return value >= 100 ? `${Math.round(value)} s` : `${value.toFixed(1)} s`;
}

function timestamp(value: number): string {
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One recording's NeuroMetrics: the cover, the terrain and the descriptors.
 *
 * Everything the two sliders touch is already in the response, so moving them never
 * costs a request - that is what the backend's radius sweep buys, and it is why the
 * page holds the whole sweep rather than one level.
 */
export default function NeuroMetricsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [levelIndex, setLevelIndex] = useState<number | null>(null);
  const [colouring, setColouring] = useState<NodeColouring>("dwell");
  const [sigmaScale, setSigmaScale] = useState(1);

  const recording = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<Recording>(`recordings/${id}`),
  });

  const metrics = useQuery({
    queryKey: ["neurometrics", id],
    queryFn: () => api.get<NeuroMetrics>(`recordings/${id}/neurometrics`),
    retry: false,
  });

  const build = useMutation({
    mutationFn: () => api.post(`recordings/${id}/neurometrics`, {}),
    onSuccess: () => {
      toast("success", "Analysing. This page updates by itself.");
      queryClient.invalidateQueries({ queryKey: ["neurometrics", id] });
    },
    onError: (e) =>
      toast(
        "error",
        e instanceof ApiRequestError ? e.error.message : "Request failed."
      ),
  });

  const data = metrics.data;
  const index = levelIndex ?? data?.default_index ?? 0;
  const level = data?.levels[index];
  const tooShort = (recording.data?.duration_s ?? 0) < MIN_DURATION_S;

  // Alpha is the one band a reader is likely to have an intuition for, so it is the
  // only one offered here; the rest stay available through the node tooltips.
  const bands = data?.bands ?? [];
  const alpha = bands.indexOf("alpha");
  const colourKeys: NodeColouring[] = [
    "dwell",
    "flux_normalized",
    "betweenness",
    ...(alpha >= 0 ? ([`band:${alpha}`] as NodeColouring[]) : []),
  ];
  const colourOptions = colourKeys.map((value) => ({
    value,
    label: colouringLabel(value, bands),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/neurometrics"
        className="type-caption inline-flex items-center gap-1 font-medium text-accent hover:underline"
      >
        <Icon name="back" className="h-3.5 w-3.5" /> NeuroMetrics
      </Link>

      <header className="mt-3 mb-8">
        {recording.data ? (
          <h1 className="type-title truncate">{recording.data.title}</h1>
        ) : (
          <Skeleton className="h-9 w-64" />
        )}
        <p className="mt-2 text-ink-2">
          {data
            ? `${data.n_points} seconds of signal, in ${data.dim_reduced} dimensions`
            : " "}
        </p>
      </header>

      {metrics.isLoading && <Skeleton className="h-[460px]" />}

      {metrics.isError && tooShort && (
        <EmptyState
          title="This recording is too short"
          text="NeuroMetrics needs about three minutes of signal. Below that there are more states than there are transitions between them, and every number would be noise."
          action={
            <Link
              className="text-accent hover:underline"
              href={`/recordings/${id}`}
            >
              Back to the recording
            </Link>
          }
        />
      )}

      {metrics.isError && !tooShort && (
        <EmptyState
          title="Not analysed yet"
          text="This recording has its trail but no NeuroMetrics. Building one reuses the embeddings that already exist, so it takes seconds."
          action={
            <Button onClick={() => build.mutate()} disabled={build.isPending}>
              {build.isPending ? "Starting…" : "Analyse now"}
            </Button>
          }
        />
      )}

      {data && level && (
        <div className="space-y-8">
          <section>
            <SectionTitle
              action={
                <span className="type-caption text-ink-3">
                  {level.n_nodes} regions · radius {level.epsilon.toFixed(2)}
                </span>
              }
            >
              The session&rsquo;s landscape
            </SectionTitle>
            <Card className="p-3 sm:p-4">
              <BallMapperGraph
                level={level}
                bands={data.bands}
                colouring={colouring}
                sigmaScale={sigmaScale}
              />
              <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
                <label className="block">
                  <span className="type-caption text-ink-3">
                    Detail · {level.n_nodes} regions
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={data.levels.length - 1}
                    step={1}
                    value={index}
                    onChange={(e) => setLevelIndex(Number(e.target.value))}
                    className="mt-2 w-full accent-[var(--accent)]"
                    aria-label="Ball radius"
                  />
                </label>
                <label className="block">
                  <span className="type-caption text-ink-3">
                    Terrain smoothing
                  </span>
                  <input
                    type="range"
                    min={0.4}
                    max={2.5}
                    step={0.1}
                    value={sigmaScale}
                    onChange={(e) => setSigmaScale(Number(e.target.value))}
                    className="mt-2 w-full accent-[var(--accent)]"
                    aria-label="Terrain smoothing"
                  />
                </label>
              </div>
              <div className="mt-4">
                <Segmented
                  label="Colour regions by"
                  value={colouring}
                  onChange={setColouring}
                  options={colourOptions}
                />
              </div>
            </Card>
            <p className="type-caption mt-2 px-1 text-ink-3">
              Height is the negative log of how much time was spent, in
              arbitrary units. Basins are states the session settled into;
              ridges are the crossings between them.
            </p>
          </section>

          <section>
            <SectionTitle>At this level of detail</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Regions"
                value={level.n_nodes}
                hint={`${level.n_edges} connections`}
              />
              <Stat
                label="Independent loops"
                value={level.betti1}
                hint="cycles in the state graph, not of the brain"
              />
              <Stat
                label="Memory of its state"
                value={seconds(level.tau_mix_s)}
                hint={
                  level.tau_mix_ci_s
                    ? `${seconds(level.tau_mix_ci_s[0])} – ${seconds(level.tau_mix_ci_s[1])}`
                    : "too short for a range"
                }
              />
              <Stat
                label="Session described"
                value={
                  level.coverage != null
                    ? `${Math.round(level.coverage * 100)}%`
                    : "–"
                }
                hint="the part the timing numbers cover"
              />
            </div>
          </section>

          <section>
            <SectionTitle>How it changes with detail</SectionTitle>
            <Card className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
              <MetricCurve
                label="Independent loops per region"
                epsilons={data.epsilons}
                values={data.levels.map((l) => l.betti1_per_node)}
                selected={index}
                onSelect={setLevelIndex}
              />
              <MetricCurve
                label="Regions"
                epsilons={data.epsilons}
                values={data.levels.map((l) => l.n_nodes)}
                selected={index}
                onSelect={setLevelIndex}
              />
              <MetricCurve
                label="Memory of its state (s)"
                epsilons={data.epsilons}
                values={data.levels.map((l) => l.tau_mix_s)}
                selected={index}
                onSelect={setLevelIndex}
              />
              <MetricCurve
                label="Layout strain"
                epsilons={data.epsilons}
                values={data.levels.map((l) => l.stress)}
                selected={index}
                onSelect={setLevelIndex}
              />
            </Card>
            <p className="type-caption mt-2 px-1 text-ink-3">
              Several of these depend on how finely the session is divided, so
              they are shown as curves rather than single numbers. Read the
              shape.
            </p>
          </section>

          <section>
            <SectionTitle>Crossings</SectionTitle>
            <Card inset>
              {level.bottlenecks.length === 0 && (
                <p className="px-5 py-4 text-ink-3">
                  No region stands out as a crossing at this level of detail.
                </p>
              )}
              {level.bottlenecks.map((nodeIndex, rank) => {
                const node = level.nodes[nodeIndex];
                if (!node) return null;
                return (
                  <div
                    key={nodeIndex}
                    className="border-b border-hairline px-5 py-3.5 last:border-b-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">Crossing {rank + 1}</p>
                      <p className="type-caption text-ink-3">
                        {(node.dwell * 100).toFixed(1)}% of the session ·{" "}
                        {node.n_visits} visit{node.n_visits === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="type-caption mt-1 text-ink-3">
                      {node.spans.slice(0, 8).map(([from, to], i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          {timestamp(from)}–{timestamp(to)}
                        </span>
                      ))}
                      {node.spans.length > 8 && " · …"}
                    </p>
                  </div>
                );
              })}
            </Card>
            <p className="type-caption mt-2 px-1 text-ink-3">
              Regions that carry traffic between others without holding much of
              the session. They should sit on the ridges of the landscape above.
            </p>
          </section>

          <section>
            <SectionTitle>How this was built</SectionTitle>
            <Card inset>
              <KeyValue label="Method" value={data.algo_name} />
              <KeyValue label="Version" value={data.algo_version} />
              <KeyValue label="Windows" value={data.n_points} />
              <KeyValue label="Window length" value={`${data.step_s} s`} />
              <KeyValue label="Dimensions covered" value={data.dim_reduced} />
              <KeyValue
                label="Radii tried"
                value={`${data.epsilons.length} (this is #${index + 1})`}
              />
              {level.bridges > 0 && (
                <KeyValue
                  label="Gaps bridged"
                  value={`${level.bridges} — parts of the session never connect`}
                />
              )}
            </Card>
          </section>

          <p className="type-caption text-ink-3">
            Exploratory, not diagnostic. These describe one recording, not a
            person, and none of them is a clinical measure.
          </p>
        </div>
      )}
    </main>
  );
}
