"use client";

/**
 * The operator console on one machine (backend V3-0007 step 1; sprint 21 / plan V4 T1).
 *
 * The console owns the run: consent, the headband and its capture, the session, the
 * upload at the end. It opens the participant's window (`/run/[session]`), which the
 * operator drags to the second screen, and talks to it over a `BroadcastChannel`: the
 * plan and the EEG clock go out at Start, commands go out while it runs; the runner's
 * state, every marker and the end of the run come back. The runner in that window stays
 * the only clock and the only state machine - the console asks, the runner does and
 * logs (`operator_command`).
 *
 * `[session]` is the run's key, which names the channel; the stimulus session opens at
 * Start, as on the plain run page, because the device model is only known once the
 * headband is connected. `?protocol=` names what to run.
 *
 * Not yet (T1 minimum): the Window Management API (the window is opened, not placed),
 * the headband panels while running (only status and battery), `end_block` at a trial
 * boundary, `repeat_block` and `extend_rest`.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
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
import {
  CommandBar,
  EventTicker,
  LiveNotes,
  PlanTimeline,
} from "@/components/console/ConsolePanels";
import {
  ConsentGate,
  needsConsentGate,
  type ConsentManifest,
} from "@/components/run/ConsentGate";
import {
  HeadbandPreflight,
  type HeadbandSource,
} from "@/components/run/HeadbandPreflight";
import {
  type RunTarget,
  SubjectPicker,
  startOptions,
} from "@/components/run/SubjectPicker";
import {
  Button,
  Card,
  ErrorBanner,
  Spinner,
  buttonClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  type ChannelMessage,
  type ConsoleChannel,
  EXIT_GRACE_MS,
  openChannel,
} from "@/lib/console/channel";
import { saveLiveNote } from "@/lib/console/notes";
import { devToolsAllowed } from "@/lib/env";
import { useAppConfig, useFeature } from "@/lib/features";
import { buildCaptureFiles, type CaptureFiles } from "@/lib/muse/captureFiles";
import {
  BluetoothMuse,
  SimulatedMuse,
  bluetoothTransport,
  type MuseDevice,
} from "@/lib/muse/device";
import { MODEL_PROFILES } from "@/lib/muse/models";
import { useMuse } from "@/lib/muse/useMuse";
import { type ProtocolDetail, planFor } from "@/lib/protocol/catalog";
import { type ClockAnchor, eegAnchor } from "@/lib/protocol/clock";
import {
  type CommandType,
  type RunnerState,
  makeCommand,
} from "@/lib/protocol/commands";
import { type Marker, toWireEvent } from "@/lib/protocol/marker";
import { officialSlug, useOfficialTexts } from "@/lib/protocol/official";
import {
  type StimulusSessionStart,
  finishSession,
  postPlan,
  startSession,
  uploadCapture,
} from "@/lib/protocol/session";
import type { ProtocolDefinition, TaskResult } from "@/lib/protocol/types";
import { useUploadErrorMessage } from "@/lib/upload";

// Never for testers: a simulated session looks real and is not (`lib/env.ts`).
const SIMULATOR_ALLOWED = devToolsAllowed(process.env.NEXT_PUBLIC_APP_ENV);

/** How long Start waits for the headband's first samples before giving up. */
const SYNC_TIMEOUT_MS = 15_000;

/** How many of the latest events the ticker shows. */
const TICKER_SIZE = 12;

type Phase =
  | "consent"
  | "preflight"
  | "syncing"
  | "running"
  | "saving"
  | "saved"
  | "failed";

/**
 * The participant's window as the console knows it. `lost` is for good: once the run
 * has started there, a window that closed or reloaded took the runner and its state with
 * it, and a new window cannot pick the run up.
 */
type Participant = "closed" | "open" | "lost";

interface Ending {
  summary: Record<string, unknown>;
  aborted: boolean;
  files: CaptureFiles | null;
}

export default function ConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ session: string }>;
  searchParams: Promise<{ protocol?: string }>;
}) {
  const { session: runKey } = use(params);
  const { protocol: protocolId } = use(searchParams);
  const t = useTranslations("console");
  const config = useAppConfig();
  const enabled = useFeature("console");

  if (config.isPending) return <Spinner />;
  if (!enabled || !protocolId)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={enabled ? t("noProtocol") : t("unavailable")} />
        <Link
          href="/protocols"
          className={buttonClass("secondary", "md", "mt-6")}
        >
          {t("backToProtocols")}
        </Link>
      </main>
    );
  return <Console runKey={runKey} protocolId={protocolId} />;
}

function Console({
  runKey,
  protocolId,
}: {
  runKey: string;
  protocolId: string;
}) {
  const router = useRouter();
  const t = useTranslations("console");
  const tUpload = useTranslations("run.upload");
  const errorText = useUploadErrorMessage();

  const protocol = useQuery({
    queryKey: ["protocol", protocolId, "run"],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${protocolId}`),
    staleTime: Infinity,
  });
  const official = useOfficialTexts();
  const slug = officialSlug(protocol.data);
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
  // The operator ticked the photosensitivity warning; the session start says so (H4).
  const [acknowledged, setAcknowledged] = useState(false);
  const photosensitive = protocol.data?.photosensitive ?? false;
  // Whom the console records (backend T3): the operator, or someone they care for.
  const [target, setTarget] = useState<RunTarget>({});
  const [targetBlocked, setTargetBlocked] = useState(false);
  const [override, setOverride] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ProtocolDefinition | null>(null);
  const [session, setSession] = useState<StimulusSessionStart | null>(null);
  const [anchor, setAnchor] = useState<ClockAnchor | null>(null);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<{
    aborted: boolean;
    captured: boolean;
    reason?: "sync_failed" | "dropped";
  } | null>(null);
  const ending = useRef<Ending | null>(null);
  const closing = useRef(false);
  const syncStarted = useRef(0);
  // The participant's window has the run: from here a reload cannot be recovered.
  const booted = useRef(false);
  // Why the run is ending, when the console decided it (the headband dropped).
  const endReason = useRef<"dropped" | undefined>(undefined);
  const dropHandled = useRef(false);

  // What the participant's window reports.
  // The channel lives in a ref: it is opened by an effect and only ever used from
  // callbacks, never to render.
  const channelRef = useRef<ConsoleChannel | null>(null);
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof BroadcastChannel !== "undefined",
    () => true
  );
  const [participant, setParticipant] = useState<Participant>("closed");
  const [runner, setRunner] = useState<RunnerState | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ticker, setTicker] = useState<
    { seq: number; label: string; tS: number }[]
  >([]);

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
      if (closing.current) return;
      closing.current = true;
      const stopped = muse.stopRecording();
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

  // The channel's messages are handled by the latest closure, without resubscribing.
  const onMessage = useRef<(message: ChannelMessage) => void>(() => {});
  useEffect(() => {
    onMessage.current = (message) => {
      switch (message.type) {
        case "hello":
          if (booted.current) {
            // a window opened or reloaded mid-run: it cannot resume, so say so there
            // and keep offering stop-and-save here
            channelRef.current?.post({ type: "detached" });
            setParticipant("lost");
            return;
          }
          setParticipant("open");
          return;
        case "gone":
          setParticipant(booted.current ? "lost" : "closed");
          return;
        case "state":
          setRunner(message.state);
          return;
        case "marker": {
          const m = message.marker;
          markers.current.push(m);
          setTicker((list) =>
            [
              {
                seq: m.seq ?? markers.current.length,
                label: m.label,
                tS: m.tSessionS ?? m.tRunMs / 1000,
              },
              ...list,
            ].slice(0, TICKER_SIZE)
          );
          return;
        }
        case "finished":
          markers.current = message.markers;
          void close(summaryOf(message.results), false);
          return;
        case "exited":
          markers.current = message.markers;
          void close({}, true, endReason.current);
          return;
      }
    };
  });

  useEffect(() => {
    const opened = openChannel(runKey);
    if (!opened) return;
    const unsubscribe = opened.subscribe((m) => onMessage.current(m));
    channelRef.current = opened;
    return () => {
      unsubscribe();
      opened.close();
      channelRef.current = null;
    };
  }, [runKey]);

  const openParticipant = useCallback(() => {
    window.open(
      `/run/${encodeURIComponent(runKey)}`,
      `bt-run-${runKey}`,
      "popup,width=1280,height=800"
    );
  }, [runKey]);

  const send = useCallback((type: CommandType, text?: string) => {
    channelRef.current?.post({
      type: "command",
      command: makeCommand(type, text),
    });
  }, []);

  const begin = useCallback(async () => {
    if (!protocol.data) return;
    if (participant !== "open") {
      setError(t("openParticipantFirst"));
      return;
    }
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
  }, [
    acknowledged,
    errorText,
    muse,
    participant,
    protocol.data,
    protocolId,
    t,
    target,
  ]);

  // Once the device clock is fitted, the participant's window gets the plan and the
  // clock, and the run begins there.
  useEffect(() => {
    if (phase !== "syncing" || !session || !plan) return;
    const timer = window.setInterval(() => {
      const fit = muse.readTimelineFit();
      const first = muse.readFirstSampleIndex();
      if (fit === null || first === null) {
        if (performance.now() - syncStarted.current > SYNC_TIMEOUT_MS) {
          window.clearInterval(timer);
          void close({}, true, "sync_failed");
        }
        return;
      }
      window.clearInterval(timer);
      setAnchor(eegAnchor(performance.now(), muse.readTimelineFit, first));
      booted.current = true;
      channelRef.current?.post({
        type: "boot",
        boot: {
          sessionId: session.id,
          plan,
          seed: session.seed,
          officialSlug: slug,
          warningShown: needsConsentGate(manifest),
          firstSampleIndex: first,
          fit,
          origin: performance.timeOrigin,
        },
      });
      setPhase("running");
    }, 100);
    return () => window.clearInterval(timer);
  }, [close, manifest, muse, phase, plan, session, slug]);

  // The fit moves as anchors accumulate; the runner reads the latest one per marker.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      const fit = muse.readTimelineFit();
      if (fit)
        channelRef.current?.post({
          type: "fit",
          fit,
          origin: performance.timeOrigin,
        });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [muse, phase]);

  /*
   * The headband dropping stops the run and keeps what was recorded, as on the run page.
   * The runner is asked to stop first and the session closes on its `exited`, so its
   * `run_aborted` reaches a session that is still open; a runner that never answers is
   * given EXIT_GRACE_MS. Handled once: the timers outlive re-renders on purpose.
   */
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (phase !== "running" || muse.status === "connected") return;
    if (dropHandled.current) return;
    dropHandled.current = true;
    endReason.current = "dropped";
    const reachable = participant === "open";
    // deferred a tick: closing updates state, which an effect must not do inline
    window.setTimeout(() => {
      if (!reachable) {
        void closeRef.current({}, true, "dropped");
        return;
      }
      send("abort");
      window.setTimeout(
        () => void closeRef.current({}, true, "dropped"),
        EXIT_GRACE_MS
      );
    }, 0);
  }, [muse.status, participant, phase, send]);

  const sessionClock = useCallback(
    () => (anchor ? anchor.toSessionS(performance.now()) : null),
    [anchor]
  );

  const labels = useMemo(
    () =>
      plan ? plan.steps.map((step) => official.step(slug, step).label) : [],
    [official, plan, slug]
  );

  if (protocol.isPending) return <Spinner />;
  if (protocol.isError || !protocol.data || !shown)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={errorText(protocol.error)} />
      </main>
    );
  if (!supported)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={t("unsupported")} />
      </main>
    );

  // Nothing to consent to: straight to the pre-flight, as on the plain run page.
  if (phase === "consent" && needsConsentGate(manifest, photosensitive))
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ConsentGate
          manifest={manifest}
          title={shown.title}
          photosensitive={photosensitive}
          onAccept={() => {
            setAcknowledged(photosensitive);
            setPhase("preflight");
          }}
          onDecline={() => router.push(`/protocols/${protocolId}`)}
        />
      </main>
    );

  if (phase === "consent" || phase === "preflight")
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="type-caption mb-1 text-ink-3">{t("title")}</p>
        <h1 className="type-title mb-6">{shown.title}</h1>
        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}
        <Card className="mb-6">
          <h2 className="type-subhead mb-2">{t("participant.title")}</h2>
          <p className="mb-4 text-[14px] text-ink-2">
            {t("participant.intro")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={openParticipant}>
              {t("participant.open")}
            </Button>
            <span className="type-caption text-ink-3">
              {participant === "open"
                ? t("participant.connected")
                : t("participant.notConnected")}
            </span>
          </div>
        </Card>
        <SubjectPicker
          protocolId={protocolId}
          value={target}
          onChange={setTarget}
          onBlocked={setTargetBlocked}
        />
        <HeadbandPreflight
          muse={muse}
          source={source}
          onSource={setSource}
          simulatorAllowed={SIMULATOR_ALLOWED}
          bluetoothSupported={transport !== null && transport !== undefined}
          override={override}
          onOverride={setOverride}
          starting={starting}
          blocked={targetBlocked}
          onStart={() => void begin()}
          onBack={() => router.push(`/protocols/${protocolId}`)}
        />
      </main>
    );

  if (phase === "syncing" || phase === "running")
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="type-caption text-ink-3">{t("title")}</p>
            <h1 className="type-title">{shown.title}</h1>
          </div>
          <p className="type-caption text-ink-3">
            {muse.status === "connected"
              ? t("headband", {
                  name: muse.deviceName ?? "Muse",
                  battery:
                    muse.batteryPercent === null
                      ? "—"
                      : `${muse.batteryPercent}%`,
                })
              : t("headbandLost")}
          </p>
        </header>
        {phase === "syncing" && (
          <Card className="mb-6 flex items-center gap-3">
            <Spinner />
            <span className="text-ink-2">{t("syncing")}</span>
          </Card>
        )}
        {participant === "lost" && (
          <div className="mb-6 space-y-3">
            <ErrorBanner message={t("participantGone")} />
            <Button variant="danger" onClick={() => void close({}, true)}>
              {t("stopAndSave")}
            </Button>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <PlanTimeline
            labels={labels}
            state={runner}
            lost={participant === "lost"}
          />
          <div className="space-y-6">
            <CommandBar
              state={runner}
              disabled={phase !== "running" || participant !== "open"}
              send={send}
            />
            {session && phase === "running" && (
              <LiveNotes
                clock={sessionClock}
                save={async (body, tStartS) => {
                  await saveLiveNote(session.recording_id, { body, tStartS });
                }}
              />
            )}
            <EventTicker events={ticker} />
          </div>
        </div>
      </main>
    );

  const done = outcome?.aborted === false;
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-title mb-4">
        {done ? tUpload("complete") : tUpload("stopped")}
      </h1>
      {outcome?.reason && (
        <div className="mb-6">
          <ErrorBanner message={tUpload(outcome.reason)} />
        </div>
      )}
      {phase === "saving" && (
        <Card className="mb-6">
          <p className="text-ink-2">
            {tUpload("progress", { pct: Math.round(progress) })}
          </p>
        </Card>
      )}
      {phase === "failed" && (
        <div className="mb-6 space-y-3">
          <ErrorBanner message={tUpload("failed", { message: error ?? "" })} />
          <Button onClick={() => void save()}>{tUpload("retry")}</Button>
        </div>
      )}
      {phase === "saved" && (
        <Card className="mb-6">
          <p className="text-ink-2">
            {outcome?.captured ? tUpload("done") : tUpload("nothing")}
          </p>
        </Card>
      )}
      <div className="flex gap-3">
        {phase === "saved" && session && outcome?.captured && (
          <Button
            onClick={() => router.push(`/recordings/${session.recording_id}`)}
          >
            {tUpload("open")}
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.push("/protocols")}>
          {tUpload("back")}
        </Button>
      </div>
    </main>
  );
}

/** The session summary as the plain run page builds it: each step's own summary. */
function summaryOf(results: TaskResult[]): Record<string, unknown> {
  return Object.fromEntries(results.map((r) => [r.stepId, r.summary]));
}
