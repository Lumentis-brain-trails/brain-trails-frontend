"use client";

/**
 * Runs one protocol.
 *
 * Three ways in, in order of how much they record:
 *
 * - `?media=<uuid>` - the real path. A pre-flight starts a session against that catalog
 *   item, which creates the live recording, and the run uses the *backend's* seed and
 *   module so a replay reproduces exactly what the participant saw.
 * - `?session=<uuid>` - a session someone else already started; markers stream into it.
 * - neither - practice. The run still happens and the marker stream is offered as a
 *   download, because the task has to be pilotable before a catalog row exists.
 *
 * Starting a session is deliberate rather than automatic: it creates a recording, and a
 * participant who backs out at the content warning should not leave an empty one behind.
 */

import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";
import { ProtocolRunner } from "@/components/protocol/ProtocolRunner";
import "@/components/protocol/kinds";
import { Button, Card, ErrorBanner } from "@/components/ui";
import { ApiRequestError } from "@/lib/api";
import {
  SIGNAL_NAVIGATOR,
  getProtocolModule,
} from "@/lib/protocol/definitions/signalNavigator";
import type { Marker } from "@/lib/protocol/marker";
import type { PhaseSummary } from "@/lib/protocol/metrics";
import { safeParseProtocol } from "@/lib/protocol/schema";
import {
  type StimulusSessionStart,
  finishSession,
  resolveProtocol,
  startSession,
} from "@/lib/protocol/session";
import {
  type MarkerSink,
  createMemorySink,
  createSessionSink,
} from "@/lib/protocol/sink";
import type { ProtocolDefinition, TaskResult } from "@/lib/protocol/types";

type Phase = "preflight" | "running" | "done" | "aborted";

export default function RunProtocolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string; media?: string; seed?: string }>;
}) {
  const { id } = use(params);
  const {
    session: sessionParam,
    media: mediaId,
    seed: seedParam,
  } = use(searchParams);
  const router = useRouter();

  const [session, setSession] = useState<StimulusSessionStart | null>(null);
  const [starting, setStarting] = useState(false);
  // A session started elsewhere is already live, so there is nothing to pre-flight.
  const [phase, setPhase] = useState<Phase>(
    mediaId && !sessionParam ? "preflight" : "running"
  );
  const [results, setResults] = useState<TaskResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Held in state, not a ref: the results screen renders from it.
  const [markers, setMarkers] = useState<readonly Marker[]>([]);

  const sessionId = session?.id ?? sessionParam ?? null;

  /** What this build ships under this id, for the pre-flight and the practice path. */
  const local = useMemo<ProtocolDefinition | null>(
    () =>
      getProtocolModule(id) ??
      (id === SIGNAL_NAVIGATOR.id ? SIGNAL_NAVIGATOR : null),
    [id]
  );

  // Once a session exists the catalog decides what runs, not the URL.
  const parsed = useMemo(() => {
    if (session) return resolveProtocol(session.module, session.definition);
    if (!local)
      return { ok: false as const, error: `No protocol named "${id}".` };
    return safeParseProtocol(local);
  }, [id, local, session]);

  const sink: MarkerSink = useMemo(
    () => (sessionId ? createSessionSink(sessionId) : createMemorySink()),
    [sessionId]
  );

  /** The backend's seed wins: a replay must reproduce this run exactly. */
  const seed = useMemo(() => {
    if (session) return session.seed;
    const fromUrl = Number(seedParam);
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : 1;
  }, [seedParam, session]);

  const begin = useCallback(async () => {
    if (!mediaId) return;
    setStarting(true);
    setError(null);
    try {
      const started = await startSession(mediaId, {
        title: local?.title,
        params: { protocol_id: id, protocol_version: local?.version ?? null },
      });
      setSession(started);
      setPhase("running");
    } catch (e) {
      const message =
        e instanceof ApiRequestError
          ? e.error.message
          : e instanceof Error
            ? e.message
            : "The session could not be started.";
      setError(message);
    } finally {
      setStarting(false);
    }
  }, [id, local, mediaId]);

  /** Close the session whichever way the run ended; an unfinished one never merges. */
  const close = useCallback(
    (summary: Record<string, unknown>, aborted: boolean) => {
      if (!sessionId) return;
      finishSession(sessionId, summary, aborted).catch((e: Error) =>
        setError(
          `The run ${aborted ? "stopped" : "finished"} but the session could not be closed: ${e.message}. The markers were already sent.`
        )
      );
    },
    [sessionId]
  );

  const onFinish = useCallback(
    (taskResults: TaskResult[], produced: readonly Marker[]) => {
      setMarkers(produced);
      setResults(taskResults);
      setPhase("done");
      close(
        Object.fromEntries(taskResults.map((r) => [r.stepId, r.summary])),
        false
      );
    },
    [close]
  );

  const onExit = useCallback(() => {
    setMarkers(sink.all());
    setPhase("aborted");
    close({}, true);
  }, [close, sink]);

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

  if (phase === "preflight") {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-1 text-2xl font-bold">{parsed.protocol.title}</h1>
        <p className="mb-6 text-sm text-neutral-500">
          {parsed.protocol.steps.length} stages ·{" "}
          {parsed.protocol.steps.map((s) => s.label).join(" → ")}
        </p>

        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}

        <Card className="mb-6">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Starting creates a recording and begins the session. Everything the
            task does is timestamped into it. You can stop at any point, and
            what you have already done is kept.
          </p>
        </Card>

        <div className="flex gap-3">
          <Button onClick={begin} disabled={starting}>
            {starting ? "Starting…" : "Start session"}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/protocols")}>
            Back
          </Button>
        </div>
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
        {session && (
          <Button
            variant="ghost"
            onClick={() => router.push(`/recordings/${session.recording_id}`)}
          >
            Open the recording
          </Button>
        )}
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
