"use client";

/**
 * Plays one protocol with EEG (backend V3-0004, V3-0005; sprints S16, S18), for the app's
 * Play (`/protocols/[id]/run`) and for the client shell's (`/my/run/[assignment]`, T3).
 *
 * `detailPath` is where the protocol is read from: its detail page for staff, the
 * assignment's pinned version for someone's patient (who cannot open the protocol
 * itself). `target` says whom the run records (`SubjectPicker`) and which assignment it
 * counts towards; `picker` is shown above the headband pre-flight. `client` is the
 * patient's own run: no scores at the end and no way into the recording - they see
 * neither (V4-0006).
 * Consent, the content warning and - for a protocol with visual blocks - the
 * photosensitivity warning come first (`ConsentGate`), then the headband pre-flight; Start opens a session, which returns the published version's
 * tree, the run's seed and links to its media. The tree is resolved here
 * (`resolvePlan`: loops, shuffles, jitter), the media are bound to it and the flat plan
 * is posted back before the first block, so review reads what was shown rather than what
 * could have been. Recording then waits for the device clock to be fitted, so every
 * marker lands on the EEG clock (`eegAnchor`, V1-0001) and inside the signal. When the
 * protocol ends - or is stopped - the capture is uploaded through the session's own
 * forms and the session is closed; the backend queues the analysis. An upload that fails
 * keeps the files in memory and offers a retry.
 *
 * An official protocol is shown in the reader's language (`lib/protocol/official.ts`):
 * the title, the warning and consent text, the outline, the labels on the result
 * screen, and - through the runner's `officialSlug` - what each block puts on screen.
 * That is display only: the plan resolved and posted here, the summary and every event
 * keep the stored English, whatever language the run was read in.
 *
 * Deferred (Alessio, 2026-09-19): writing the capture to disk as it arrives, automatic
 * Bluetooth reconnection and media preload - see the S16 sprint notes.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
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
import { type RunTarget, startOptions } from "@/components/run/SubjectPicker";
import { Button, Card, ErrorBanner, Spinner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { useUploadErrorMessage } from "@/lib/upload";
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
import { resultTitles } from "@/lib/protocol/results";
import { devToolsAllowed } from "@/lib/env";
import { type ProtocolDetail, planFor } from "@/lib/protocol/catalog";
import { officialSlug, useOfficialTexts } from "@/lib/protocol/official";
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

export function RunProtocol({
  protocolId,
  detailPath,
  backHref,
  target = {},
  picker = null,
  startBlocked = false,
  client = false,
}: {
  protocolId: string;
  /** API path of the `ProtocolDetail` to run. */
  detailPath: string;
  /** Where Back and Decline lead. */
  backHref: string;
  target?: RunTarget;
  picker?: ReactNode;
  /** The picker is still resolving whom the run records: Start waits. */
  startBlocked?: boolean;
  client?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("run.upload");
  const tMy = useTranslations("my.run");
  // An API error reads through the catalogue (its code, else the server's own
  // message) and a failed upload to storage by its code; anything else thrown here is
  // a diagnostic and is shown as it is.
  const errorText = useUploadErrorMessage();

  const protocol = useQuery({
    queryKey: ["protocol", protocolId, "run", detailPath],
    queryFn: () => api.get<ProtocolDetail>(detailPath),
    staleTime: Infinity,
  });
  const official = useOfficialTexts();
  // Null for a protocol somebody wrote: every text of theirs is shown as stored.
  const slug = officialSlug(protocol.data);
  // What the pages before and after the run read; `protocol.data` stays as stored.
  const shown = useMemo(
    () => (protocol.data ? official.detail(protocol.data) : undefined),
    [official, protocol.data]
  );
  const manifest = useMemo<ConsentManifest>(() => {
    const raw = (protocol.data?.definition ?? {}) as {
      manifest?: Partial<ConsentManifest>;
    };
    return official.manifest(slug, {
      content_warning: raw.manifest?.content_warning ?? null,
      requires_consent: raw.manifest?.requires_consent ?? false,
      consent_text: raw.manifest?.consent_text ?? null,
    });
  }, [official, protocol.data, slug]);

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
  // The person ticked the photosensitivity warning; the session start says so (H4).
  const [acknowledged, setAcknowledged] = useState(false);
  // The detail says whether the protocol's current version is visual; a run of an
  // assignment's pinned version may differ, and the server then refuses the start
  // (`photosensitivity_ack_required`): the warning is forced on and shown again.
  const [forceWarning, setForceWarning] = useState(false);
  const photosensitive =
    forceWarning || (protocol.data?.photosensitive ?? false);
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
        ...startOptions(target),
        ...(acknowledged
          ? { acknowledged: ["photosensitivity" as const] }
          : {}),
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
      if (
        e instanceof ApiRequestError &&
        e.error.code === "photosensitivity_ack_required"
      ) {
        setForceWarning(true);
        setAcknowledged(false);
        setPhase("consent");
        return;
      }
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  }, [acknowledged, errorText, muse, protocol.data, protocolId, target]);

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
  }, [errorText, session]);

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
  if (protocol.isError || !protocol.data || !shown)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={errorText(protocol.error)} />
      </main>
    );

  if (phase === "consent")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        {needsConsentGate(manifest, photosensitive) ? (
          <ConsentGate
            manifest={manifest}
            title={shown.title}
            photosensitive={photosensitive}
            onAccept={() => {
              setAcknowledged(photosensitive);
              setPhase("preflight");
            }}
            onDecline={() => router.push(backHref)}
          />
        ) : (
          <Skip onDone={() => setPhase("preflight")} />
        )}
      </main>
    );

  if (phase === "preflight")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="type-title mb-1">{shown.title}</h1>
        {/* a one-block protocol named after its block would say its title twice */}
        <p className="mb-6 text-ink-2">
          {shown.outline.length > 1
            ? shown.outline.map((s) => s.label).join(" → ")
            : shown.summary}
        </p>
        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}
        {picker}
        <HeadbandPreflight
          muse={muse}
          source={source}
          onSource={setSource}
          simulatorAllowed={SIMULATOR_ALLOWED}
          bluetoothSupported={transport !== null && transport !== undefined}
          override={override}
          onOverride={setOverride}
          starting={starting}
          blocked={startBlocked}
          onStart={() => void begin()}
          onBack={() => router.push(backHref)}
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
            officialSlug={slug}
            warningShown={needsConsentGate(manifest)}
            seed={session?.seed ?? 1}
            sink={sink}
            anchor={anchor}
            signal={muse.eegFeed}
            onFinish={onFinish}
            onExit={onExit}
          />
        )}
      </RunSurface>
    );

  const done = outcome?.aborted === false;
  // Named for the reader; `plan`, already posted, keeps its stored labels.
  const titles = resultTitles(
    results,
    plan && {
      ...plan,
      steps: plan.steps.map((step) => official.step(slug, step)),
    }
  );
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
            {!outcome?.captured
              ? t("nothing")
              : client
                ? tMy("saved")
                : t("done")}
          </p>
        </Card>
      )}
      {/* a patient sees no score (V4-0006): the review is their carer's */}
      {(client ? [] : results).map((result) => {
        const summary = result.summary as Partial<PhaseSummary>;
        if (summary.hitRate === undefined) return null;
        return (
          <Card key={result.stepId} className="mb-4">
            <h2 className="type-subhead mb-3">{titles[result.stepId]}</h2>
            <PhaseStats summary={summary} />
          </Card>
        );
      })}
      <div className="flex gap-3">
        {phase === "saved" && session && outcome?.captured && !client && (
          <Button
            onClick={() => router.push(`/recordings/${session.recording_id}`)}
          >
            {t("open")}
          </Button>
        )}
        <Button
          variant={client ? "primary" : "ghost"}
          onClick={() => router.push(client ? backHref : "/protocols")}
        >
          {client ? tMy("back") : t("back")}
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

/** A go/no-go block's scores, named from `run.results`. */
function PhaseStats({ summary }: { summary: Partial<PhaseSummary> }) {
  const t = useTranslations("run.results");
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-3">
      <Stat label={t("hits")} value={pct(summary.hitRate)} />
      <Stat label={t("misses")} value={pct(summary.omissionRate)} />
      <Stat label={t("falseDocks")} value={pct(summary.commissionRate)} />
      <Stat label={t("medianRt")} value={ms(summary.medianRtMs)} />
      <Stat label={t("rtVariability")} value={ms(summary.rtMadMs)} />
      <Stat label={t("criterion")} value={num(summary.criterion)} />
    </dl>
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
