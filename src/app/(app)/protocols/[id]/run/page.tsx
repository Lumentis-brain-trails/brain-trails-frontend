"use client";

/**
 * Plays one protocol with EEG (backend V3-0005, sprint S16).
 *
 * The route's id is the catalog item. Pre-flight pairs the headband and checks contact;
 * Start opens a session, starts recording and waits for the device clock to be fitted,
 * so every marker the protocol emits lands on the EEG clock (`eegAnchor`, V1-0001) and
 * inside the signal. When the protocol ends - or is stopped - the capture is uploaded
 * through the session's own forms and the session is closed; the backend then queues the
 * analysis. An upload that fails keeps the files in memory and offers a retry.
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
  HeadbandPreflight,
  type HeadbandSource,
} from "@/components/run/HeadbandPreflight";
import {
  RunSurface,
  enterFullscreen,
  exitFullscreen,
} from "@/components/run/RunSurface";
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
import { protocolFor } from "@/lib/protocol/catalog";
import {
  type StimulusSessionStart,
  finishSession,
  startSession,
  uploadCapture,
} from "@/lib/protocol/session";
import { type MarkerSink, createSessionSink } from "@/lib/protocol/sink";
import type { TaskResult } from "@/lib/protocol/types";
import type { Media } from "@/lib/types";

const SIMULATOR_ALLOWED = process.env.NEXT_PUBLIC_APP_ENV !== "prod";

type Phase =
  "preflight" | "syncing" | "running" | "saving" | "saved" | "failed";

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
  const { id: mediaId } = use(params);
  const router = useRouter();
  const t = useTranslations("run.upload");

  const media = useQuery({
    queryKey: ["media", mediaId, "run"],
    queryFn: () => api.get<Media>(`media/${mediaId}`),
    staleTime: Infinity,
  });
  const parsed = useMemo(
    () => (media.data ? protocolFor(media.data) : null),
    [media.data]
  );

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

  const [phase, setPhase] = useState<Phase>("preflight");
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
  } | null>(null);
  const markers = useRef<readonly Marker[]>([]);
  useFocusMode(phase === "syncing" || phase === "running");

  const sink: MarkerSink | null = useMemo(
    () => (session ? createSessionSink(session.id) : null),
    [session]
  );

  const begin = useCallback(async () => {
    if (!media.data || !parsed?.ok) return;
    setStarting(true);
    setError(null);
    // Full screen needs the click's user gesture: ask before the first await.
    const fullscreen = enterFullscreen();
    try {
      const started = await startSession(mediaId, {
        title: media.data.title,
        device: MODEL_PROFILES[muse.model].apiDevice,
        params: {
          protocol_id: parsed.protocol.id,
          protocol_version: parsed.protocol.version,
        },
      });
      await fullscreen;
      muse.startRecording();
      setSession(started);
      setPhase("syncing");
    } catch (e) {
      exitFullscreen();
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }, [media.data, mediaId, muse, parsed]);

  // The protocol starts only once the device clock is fitted and the recording has its
  // first sample: every marker then lands on the EEG clock, never on a guess.
  useEffect(() => {
    if (phase !== "syncing") return;
    const timer = window.setInterval(() => {
      const first = muse.readFirstSampleIndex();
      if (muse.readTimelineFit() === null || first === null) return;
      window.clearInterval(timer);
      setAnchor(eegAnchor(performance.now(), muse.readTimelineFit, first));
      setPhase("running");
    }, 100);
    return () => window.clearInterval(timer);
  }, [muse, phase]);

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
    async (summary: Record<string, unknown>, aborted: boolean) => {
      exitFullscreen();
      const stopped = muse.stopRecording();
      const files = stopped
        ? await buildCaptureFiles({
            ...stopped,
            deviceName: muse.deviceName ?? "Muse",
            model: muse.model,
          })
        : null;
      ending.current = { summary, aborted, files };
      setOutcome({ aborted, captured: files !== null });
      await save();
    },
    [muse, save]
  );

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

  if (media.isPending) return <Spinner />;
  if (media.isError || !parsed)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={errorText(media.error)} />
      </main>
    );
  if (!parsed.ok)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={parsed.error} />
      </main>
    );

  if (phase === "preflight")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="type-title mb-1">{media.data.title}</h1>
        <p className="mb-6 text-ink-2">
          {parsed.protocol.steps.map((s) => s.label).join(" → ")}
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
          onBack={() => router.push(`/protocols/${mediaId}`)}
        />
      </main>
    );

  if (phase === "syncing" || phase === "running")
    return (
      <RunSurface>
        {phase === "syncing" || !anchor || !sink ? (
          <div className="flex min-h-dvh items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ProtocolRunner
            protocol={parsed.protocol}
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
