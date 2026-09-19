"use client";

/**
 * Runs one protocol.
 *
 * Markers go to the session event stream when a session id is supplied
 * (`?session=<uuid>`), which is the shipped `POST /sessions/{id}/events` contract. Without
 * one the run still completes and the stream is offered as a download - the task has to be
 * usable before headband capture is wired, or it cannot be piloted at all.
 */

import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";
import { ProtocolRunner } from "@/components/protocol/ProtocolRunner";
import "@/components/protocol/kinds";
import { Button, Card, ErrorBanner } from "@/components/ui";
import {
  PROTOCOL_MODULES,
  SIGNAL_NAVIGATOR,
} from "@/lib/protocol/definitions/signalNavigator";
import type { Marker } from "@/lib/protocol/marker";
import type { PhaseSummary } from "@/lib/protocol/metrics";
import { safeParseProtocol } from "@/lib/protocol/schema";
import {
  type MarkerSink,
  createMemorySink,
  createSessionSink,
} from "@/lib/protocol/sink";
import type { TaskResult } from "@/lib/protocol/types";
import { api } from "@/lib/api";

function findProtocol(id: string) {
  return Object.values(PROTOCOL_MODULES).find((p) => p.id === id) ?? null;
}

export default function RunProtocolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string; seed?: string }>;
}) {
  const { id } = use(params);
  const { session: sessionId, seed: seedParam } = use(searchParams);
  const router = useRouter();

  const [phase, setPhase] = useState<"running" | "done" | "aborted">("running");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Held in state, not a ref: the results screen renders from it.
  const [markers, setMarkers] = useState<readonly Marker[]>([]);

  const parsed = useMemo(() => {
    const definition =
      findProtocol(id) ??
      (id === SIGNAL_NAVIGATOR.id ? SIGNAL_NAVIGATOR : null);
    if (!definition)
      return { ok: false as const, error: `No protocol named "${id}".` };
    return safeParseProtocol(definition);
  }, [id]);

  // Without a session the run is still valid data; it just has nowhere to stream to.
  const sink: MarkerSink = useMemo(
    () => (sessionId ? createSessionSink(sessionId) : createMemorySink()),
    [sessionId]
  );

  const seed = useMemo(() => {
    const parsedSeed = Number(seedParam);
    return Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : 1;
  }, [seedParam]);

  const onFinish = useCallback(
    (taskResults: TaskResult[], markers: readonly Marker[]) => {
      setMarkers(markers);
      setResults(taskResults);
      setPhase("done");
      if (!sessionId) return;
      const summary = Object.fromEntries(
        taskResults.map((r) => [r.stepId, r.summary])
      );
      api
        .post(`sessions/${sessionId}/finish`, { summary, aborted: false })
        .catch((e: Error) =>
          setError(`The run finished but could not be closed: ${e.message}`)
        );
    },
    [sessionId]
  );

  const onExit = useCallback(() => {
    setMarkers(sink.all());
    setPhase("aborted");
    if (!sessionId) return;
    api
      .post(`sessions/${sessionId}/finish`, { summary: {}, aborted: true })
      .catch((e: Error) =>
        setError(`The run stopped but could not be closed: ${e.message}`)
      );
  }, [sessionId, sink]);

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(markers, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}-markers.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [id, markers]);

  if (!parsed.ok) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorBanner message={parsed.error} />
      </main>
    );
  }

  if (phase === "running") {
    return (
      <ProtocolRunner
        protocol={parsed.protocol}
        seed={seed}
        sink={sink}
        onFinish={onFinish}
        onExit={onExit}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">
        {phase === "done" ? "Route complete" : "Session stopped"}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">
        {markers.length} markers recorded
        {sessionId
          ? " and sent."
          : ". No session was attached, so nothing was uploaded."}
      </p>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {results.map((result) => {
        const summary = result.summary as Partial<PhaseSummary>;
        if (summary.hitRate === undefined) return null;
        return (
          <Card key={result.stepId} className="mb-4">
            <h2 className="mb-3 font-semibold capitalize">
              {result.stepId.replace(/_/g, " ")}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label="Hits" value={pct(summary.hitRate)} />
              <Stat label="Misses" value={pct(summary.omissionRate)} />
              <Stat label="False docks" value={pct(summary.commissionRate)} />
              <Stat label="Median RT" value={ms(summary.medianRtMs)} />
              <Stat label="RT variability" value={ms(summary.rtMadMs)} />
              <Stat label="Criterion" value={num(summary.criterion)} />
            </dl>
          </Card>
        );
      })}

      <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Fewer false docks alone does not mean better control &mdash; it can
          reflect responding less often overall. Read hits, misses, false docks,
          reaction time and criterion together, never one in isolation. This is
          not a medical assessment or diagnosis.
        </p>
      </Card>

      <div className="flex gap-3">
        <Button onClick={download}>Download marker stream</Button>
        <Button variant="ghost" onClick={() => router.push("/protocols")}>
          Back to protocols
        </Button>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(0)}%`;
const ms = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v)} ms`;
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toFixed(2);
