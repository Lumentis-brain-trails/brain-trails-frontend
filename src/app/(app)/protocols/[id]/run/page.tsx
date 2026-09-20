"use client";

/**
 * Plays one protocol with EEG (backend V3-0004, V3-0005; sprints S16, S18).
 *
 * The route's id is the protocol. Consent and the content warning come first, then the
 * headband pre-flight; Start opens a session, which returns the published version's
 * tree, the run's seed and links to its media. The tree is resolved here
 * (`resolvePlan`: loops, shuffles, jitter), the media are bound to it and the flat plan
 * is posted back before the first block, so review reads what was shown rather than what
 * could have been. Recording then waits for the device clock to be fitted, so every
 * marker lands on the EEG clock (`eegAnchor`, V1-0001) and inside the signal. When the
 * protocol ends - or is stopped - the capture is uploaded through the session's own
 * forms and the session is closed; the backend queues the analysis. An upload that fails
 * keeps the files in memory and offers a retry.
 *
 * Deferred (Alessio, 2026-09-19): writing the capture to disk as it arrives, automatic
 * Bluetooth reconnection and media preload - see the S16 sprint notes.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ProtocolRunner } from "@/components/protocol/ProtocolRunner";
import "@/components/protocol/kinds";
import {
  ConsentGate,
  needsConsentGate,
  type ConsentManifest,
} from "@/components/run/ConsentGate";
import {
  HeadbandPreflight,
  type HeadbandSource,
} from "@/components/run/HeadbandPreflight";
import { RunSurface, exitFullscreen } from "@/components/run/RunSurface";
import { Button, Card, ErrorBanner, Spinner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { useFocusMode } from "@/lib/focus";
import {
  BluetoothMuse,
  SimulatedMuse,
  bluetoothTransport,
  type MuseDevice,
} from "@/lib/muse/device";
import { buildCaptureFiles, type CaptureFiles } from "@/lib/muse/captureFiles";
import { MODEL_PROFILES } from "@/lib/muse/models";
import { useMuse } from "@/lib/muse/useMuse";
import { type ClockAnchor, eegAnchor } from "@/lib/protocol/clock";
import { type Marker, toWireEvent } from "@/lib/protocol/marker";
import type { PhaseSummary } from "@/lib/protocol/metrics";
import { devToolsAllowed } from "@/lib/env";
import { type ProtocolDetail, planFor } from "@/lib/protocol/catalog";
import {
  type StimulusSessionStart,
  finishSession,
  postPlan,
  startSession,
  uploadCapture,
} from "@/lib/protocol/session";
import { type MarkerSink, createSessionSink } from "@/lib/protocol/sink";
import type { ProtocolDefinition, TaskResult } from "@/lib/protocol/types";

// Never for testers: a simulated session looks real and is not (`lib/env.ts`).
const SIMULATOR_ALLOWED = devToolsAllowed(process.env.NEXT_PUBLIC_APP_ENV);

/** How long Start waits for the headband's first samples before giving up. */
const SYNC_TIMEOUT_MS = 15_000;

type Phase =
  | "consent"
  | "preflight"
  | "syncing"
  | "running"
  | "saving"
  | "saved"
  | "failed";

/** What a finished or stopped run hands to the upload, kept for a retry. */
interface Ending {
  summary: Record<string, unknown>;
  aborted: boolean;
  files: CaptureFiles | null;
}

const errorText = (e: unknown) =>
  e instanceof ApiRequestError
    ? e.error.message
    : e instanceof Error
      ? e.message
      : String(e);

export default function RunProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: protocolId } = use(params);
  const router = useRouter();
  const t = useTranslations("run.upload");

  const protocol = useQuery({
    queryKey: ["protocol", protocolId, "run"],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${protocolId}`),
    staleTime: Infinity,
  });
  const manifest = useMemo<ConsentManifest>(() => {
    const raw = (protocol.data?.definition ?? {}) as {
      manifest?: Partial<ConsentManifest>;
    };
    return {
      content_warning: raw.manifest?.content_warning ?? null,
      requires_consent: raw.manifest?.requires_consent ?? false,
      consent_text: raw.manifest?.consent_text ?? null,
    };
  }, [protocol.data]);

  const transport = useSyncExternalStore(
    () => () => {},
    () => bluetoothTransport(),
    () => undefined
  );
  const [source, setSource] = useState<HeadbandSource>(
    SIMULATOR_ALLOWED ? "simulated" : "bluetooth"
  );
  const createDevice = useCallback((): MuseDevice => {
    if (source === "bluetooth") return new BluetoothMuse();
    return new SimulatedMuse({
      model: source === "simulated-athena" ? "athena" : "muse-2",
    });
  }, [source]);
  const muse = useMuse(createDevice);

  const [phase, setPhase] = useState<Phase>("consent");
  const [plan, setPlan] = useState<ProtocolDefinition | null>(null);
  const [override, setOverride] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StimulusSessionStart | null>(null);
  const [anchor, setAnchor] = useState<ClockAnchor | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<TaskResult[]>([]);
  const ending = useRef<Ending | null>(null);
  // What the result screen shows; the ref above keeps the files for a retry.
  const [outcome, setOutcome] = useState<{
    aborted: boolean;
    captured: boolean;
    reason?: "sync_failed" | "dropped";
  } | null>(null);
  const markers = useRef<readonly Marker[]>([]);
  const syncStarted = useRef(0);
  useFocusMode(phase === "syncing" || phase === "running");

  const sink: MarkerSink | null = useMemo(
    () => (session ? createSessionSink(session.id) : null),
    [session]
  );

  const begin = useCallback(async () => {
    if (!protocol.data) return;
    setStarting(true);
    setError(null);
    try {
      const started = await startSession(protocolId, {
        device: MODEL_PROFILES[muse.model].apiDevice,
      });
      // The tree becomes this run's flat plan here, and the backend stores it: from now
      // on, what was shown is a record, not something to re-derive.
      const resolved = planFor(started);
      if (!resolved.ok) {
        setError(resolved.error);
        return;
      }
      await postPlan(started.id, resolved.protocol);
      setPlan(resolved.protocol);
      muse.startRecording();
      syncStarted.current = performance.now();
      setSession(started);
      setPhase("syncing");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }, [muse, protocol.data, protocolId]);

  const save = useCallback(async () => {
    const end = ending.current;
    if (!session || !end) return;
    setPhase("saving");
    setError(null);
    try {
      const capture =
        end.files && session.upload
          ? await uploadCapture(session.upload, end.files, setProgress)
          : undefined;
      await finishSession(session.id, {
        summary: end.summary,
        aborted: end.aborted || capture === undefined,
        capture,
        events: markers.current.map(toWireEvent),
      });
      setPhase("saved");
    } catch (e) {
      setError(errorText(e));
      setPhase("failed");
    }
  }, [session]);

  const close = useCallback(
    async (
      summary: Record<string, unknown>,
      aborted: boolean,
      reason?: "sync_failed" | "dropped"
    ) => {
      exitFullscreen();
      const stopped = muse.stopRecording();
      // A capture with no sample is nothing to analyse: the session closes as aborted.
      const files =
        stopped && stopped.capture.sampleCount > 0
          ? await buildCaptureFiles({
              ...stopped,
              deviceName: muse.deviceName ?? "Muse",
              model: muse.model,
            })
          : null;
      ending.current = { summary, aborted, files };
      setOutcome({ aborted, captured: files !== null, reason });
      await save();
    },
    [muse, save]
  );

  // The headband dropping during the run stops it and keeps what was recorded; waiting
  // for a signal that never comes gives up after SYNC_TIMEOUT_MS.
  useEffect(() => {
    if (
      (phase === "syncing" || phase === "running") &&
      muse.status !== "connected"
    ) {
      const reason = phase === "syncing" ? "sync_failed" : "dropped";
      // Deferred a tick: closing updates state, which an effect must not do inline.
      const timer = window.setTimeout(() => {
        markers.current = sink?.all() ?? [];
        void close({}, true, reason);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [close, muse.status, phase, sink]);

  // The protocol starts only once the device clock is fitted and the recording has its
  // first sample: every marker then lands on the EEG clock, never on a guess.
  useEffect(() => {
    if (phase !== "syncing") return;
    const timer = window.setInterval(() => {
      const first = muse.readFirstSampleIndex();
      if (muse.readTimelineFit() === null || first === null) {
        if (performance.now() - syncStarted.current > SYNC_TIMEOUT_MS) {
          window.clearInterval(timer);
          void close({}, true, "sync_failed");
        }
        return;
      }
      window.clearInterval(timer);
      setAnchor(eegAnchor(performance.now(), muse.readTimelineFit, first));
      setPhase("running");
    }, 100);
    return () => window.clearInterval(timer);
  }, [close, muse, phase]);

  const onFinish = useCallback(
    (taskResults: TaskResult[], produced: readonly Marker[]) => {
      markers.current = produced;
      setResults(taskResults);
      void close(
        Object.fromEntries(taskResults.map((r) => [r.stepId, r.summary])),
        false
      );
    },
    [close]
  );

  const onExit = useCallback(() => {
    markers.current = sink?.all() ?? [];
    void close({}, true);
  }, [close, sink]);

  if (protocol.isPending) return <Spinner />;
  if (protocol.isError || !protocol.data)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={errorText(protocol.error)} />
      </main>
    );

  if (phase === "consent")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        {needsConsentGate(manifest) ? (
          <ConsentGate
            manifest={manifest}
            title={protocol.data.title}
            onAccept={() => setPhase("preflight")}
            onDecline={() => router.push(`/protocols/${protocolId}`)}
          />
        ) : (
          <Skip onDone={() => setPhase("preflight")} />
        )}
      </main>
    );

  if (phase === "preflight")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="type-title mb-1">{protocol.data.title}</h1>
        {/* a one-block protocol named after its block would say its title twice */}
        <p className="mb-6 text-ink-2">
          {protocol.data.outline.length > 1
            ? protocol.data.outline.map((s) => s.label).join(" → ")
            : protocol.data.summary}
        </p>
        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}
        <HeadbandPreflight
          muse={muse}
          source={source}
          onSource={setSource}
          simulatorAllowed={SIMULATOR_ALLOWED}
          bluetoothSupported={transport !== null && transport !== undefined}
          override={override}
          onOverride={setOverride}
          starting={starting}
          onStart={() => void begin()}
          onBack={() => router.push(`/protocols/${protocolId}`)}
        />
      </main>
    );

  if (phase === "syncing" || phase === "running")
    return (
      <RunSurface>
        {phase === "syncing" || !anchor || !sink || !plan ? (
          <div className="flex min-h-dvh items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ProtocolRunner
            protocol={plan}
            warningShown={needsConsentGate(manifest)}
            seed={session?.seed ?? 1}
            sink={sink}
            anchor={anchor}
            onFinish={onFinish}
            onExit={onExit}
          />
        )}
      </RunSurface>
    );

  const done = outcome?.aborted === false;
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title mb-4">{done ? t("complete") : t("stopped")}</h1>
      {outcome?.reason && (
        <div className="mb-6">
          <ErrorBanner message={t(outcome.reason)} />
        </div>
      )}
      {phase === "saving" && (
        <Card className="mb-6">
          <p className="text-ink-2">
            {t("progress", { pct: Math.round(progress) })}
          </p>
        </Card>
      )}
      {phase === "failed" && (
        <div className="mb-6 space-y-3">
          <ErrorBanner message={t("failed", { message: error ?? "" })} />
          <Button onClick={() => void save()}>{t("retry")}</Button>
        </div>
      )}
      {phase === "saved" && (
        <Card className="mb-6">
          <p className="text-ink-2">
            {outcome?.captured ? t("done") : t("nothing")}
          </p>
        </Card>
      )}
      {results.map((result) => {
        const summary = result.summary as Partial<PhaseSummary>;
        if (summary.hitRate === undefined) return null;
        return (
          <Card key={result.stepId} className="mb-4">
            <h2 className="type-subhead mb-3 capitalize">
              {result.stepId.replace(/_/g, " ")}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-3">
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
      <div className="flex gap-3">
        {phase === "saved" && session && outcome?.captured && (
          <Button
            onClick={() => router.push(`/recordings/${session.recording_id}`)}
          >
            {t("open")}
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.push("/protocols")}>
          {t("back")}
        </Button>
      </div>
    </main>
  );
}

/**
 * Nothing to consent to: move on without a screen the participant must click through.
 * An effect, not a render-time transition, because setting state during render of the
 * same component is what React forbids.
 */
function Skip({ onDone }: { onDone: () => void }) {
  useEffect(onDone, [onDone]);
  return <Spinner />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
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
