"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ContactLights } from "@/components/ContactLights";
import { HeadbandDiagram } from "@/components/HeadbandDiagram";
import { LiveSignal } from "@/components/LiveSignal";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Icon,
  Input,
  KeyValue,
  ListRow,
  Select,
  SectionTitle,
} from "@/components/ui";
import { SessionSheet, type StoppedSession } from "@/components/SessionSheet";
import { TASK_LABELS } from "@/lib/types";
import {
  BluetoothMuse,
  isWebBluetoothSupported,
  SimulatedMuse,
  type MuseDevice,
} from "@/lib/muse/device";
import { EEG_CHANNELS, SAMPLE_RATE_HZ } from "@/lib/muse/protocol";
import { useMuse } from "@/lib/muse/useMuse";
import { useFocusMode } from "@/lib/focus";

const SIMULATOR_ALLOWED = process.env.NEXT_PUBLIC_APP_ENV !== "prod";

/**
 * Record (sprint 11): pair the Muse over Web Bluetooth, watch the four contact
 * lights and the live signal, then record a free session and upload it as a
 * canonical Brain Trails session file. Stimulus protocols and markers are a
 * later step.
 *
 * Either headband generation can be worn: which protocol the band speaks is
 * settled by the driver after pairing, and the session file is the same four
 * electrodes either way. Everything else the band sends -- decoded or not --
 * is kept in the raw Bluetooth capture uploaded beside it (V2-0006).
 */
export default function RecordPage() {
  // Web Bluetooth support is a client-only fact: the server snapshot is null so
  // the server render and the first client render agree.
  const supported = useSyncExternalStore(
    () => () => {},
    () => isWebBluetoothSupported(),
    () => null
  );
  const [source, setSource] = useState<
    "bluetooth" | "simulated" | "simulated-athena"
  >("bluetooth");

  const createDevice = useCallback((): MuseDevice => {
    if (source === "bluetooth") return new BluetoothMuse();
    return new SimulatedMuse({
      model: source === "simulated-athena" ? "athena" : "muse-2",
    });
  }, [source]);
  const muse = useMuse(createDevice);
  const connected = muse.status === "connected";
  const [title, setTitle] = useState("");
  const [taskLabel, setTaskLabel] = useState("");
  const [override, setOverride] = useState(false);
  const [stopped, setStopped] = useState<StoppedSession | null>(null);
  const canStart = connected && !muse.isRecording && (muse.allGood || override);

  const stop = () => {
    const result = muse.stopRecording();
    if (!result) return;
    setStopped({
      capture: result.capture,
      timeline: result.timeline,
      extras: result.extras,
      raw: result.raw,
      deviceName: muse.deviceName ?? "Muse",
      model: muse.model,
      title: title.trim() || `Session ${new Date().toLocaleString()}`,
      taskLabel,
    });
  };

  // While recording the chrome steps aside: the session gets the whole screen.
  useFocusMode(muse.isRecording);

  if (supported === false && !SIMULATOR_ALLOWED) return <Unsupported />;
  if (muse.isRecording)
    return (
      <LiveSession
        muse={muse}
        title={title.trim() || "New session"}
        taskLabel={taskLabel}
        onStop={stop}
      />
    );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Record</h1>
          <p className="mt-1 text-ink-2">
            Wear the band — Muse 2, Muse S or Muse S Athena — wait for four
            green lights, then start.
          </p>
        </div>
        <BrowserStatus supported={supported} />
      </div>

      {supported === false && (
        <div className="mb-6">
          <ErrorBanner message="This browser cannot talk to the Muse. Use Chrome or Edge on a computer, or try the simulated headband below." />
        </div>
      )}
      {muse.error && (
        <div className="mb-6">
          <ErrorBanner message={muse.error} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <section>
            <SectionTitle
              action={
                <span className="type-caption text-ink-3">
                  Recomputed every second on the last 2 s
                </span>
              }
            >
              Contact quality
            </SectionTitle>
            <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
              <Card className="flex items-center justify-center p-4">
                <HeadbandDiagram quality={muse.quality} />
              </Card>
              <ContactLights quality={muse.quality} />
            </div>
          </section>
          <section>
            <SectionTitle>Signal</SectionTitle>
            <Card className="p-4 pb-2">
              {connected ? (
                <LiveSignal getRecent={muse.getRecent} active={connected} />
              ) : (
                <EmptyState
                  title="No signal yet"
                  text="Connect a headband to see the four electrodes scroll here."
                />
              )}
            </Card>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section>
            <SectionTitle>Device</SectionTitle>
            <Card inset>
              <ListRow className="justify-between">
                <div>
                  <div className="type-subhead">
                    {muse.deviceName ?? "Muse 2 or Muse S"}
                  </div>
                  <div className="type-caption text-ink-3">
                    {connected
                      ? muse.profile.label
                      : source === "bluetooth"
                        ? "Bluetooth Low Energy"
                        : "Simulated headband"}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                  <span
                    className={
                      "h-2 w-2 rounded-full " +
                      (connected
                        ? "bg-ok"
                        : muse.status === "connecting"
                          ? "bg-warn"
                          : "bg-ink-3/40")
                    }
                  />
                  {connected
                    ? "Connected"
                    : muse.status === "connecting"
                      ? "Connecting"
                      : "Not connected"}
                </span>
              </ListRow>
              <KeyValue
                label="Battery"
                value={
                  muse.batteryPercent !== null ? `${muse.batteryPercent}%` : "—"
                }
                mono
              />
              <KeyValue
                label="Sample rate"
                value={`${SAMPLE_RATE_HZ} Hz`}
                mono
              />
              <KeyValue
                label="Packets"
                value={
                  connected
                    ? `${muse.packetRate.toFixed(0)} / s · ${muse.timeline?.lostPackets ?? 0} lost`
                    : "—"
                }
                mono
              />
              <KeyValue
                label="Motion"
                value={
                  muse.sensors.accG !== null
                    ? `${muse.sensors.accG.toFixed(2)} g · ${muse.sensors.gyroDps?.toFixed(0) ?? "—"} °/s`
                    : "—"
                }
                mono
              />
              <KeyValue
                label="PPG (infrared)"
                value={
                  connected && !muse.profile.hasPpg
                    ? "not on this band"
                    : muse.sensors.ppgInfrared !== null
                      ? muse.sensors.ppgInfrared.toFixed(0)
                      : "—"
                }
                mono
              />
              <KeyValue
                label="Raw link"
                value={
                  connected && source === "bluetooth"
                    ? `${muse.sensors.rawPackets} packets · every byte kept`
                    : "—"
                }
                mono
              />
              <KeyValue
                label="Clock"
                value={
                  muse.timeline?.effectiveRateHz
                    ? `${muse.timeline.effectiveRateHz.toFixed(2)} Hz · jitter ${muse.timeline.jitterRmsMs?.toFixed(1)} ms`
                    : "—"
                }
                mono
              />
              <ListRow className="justify-end gap-2">
                {connected ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void muse.disconnect()}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <>
                    {SIMULATOR_ALLOWED && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={muse.status === "connecting"}
                          onClick={() => setSource("simulated")}
                          aria-pressed={source === "simulated"}
                        >
                          Simulated
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={muse.status === "connecting"}
                          onClick={() => setSource("simulated-athena")}
                          aria-pressed={source === "simulated-athena"}
                        >
                          Simulated Athena
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      disabled={
                        muse.status === "connecting" ||
                        (source === "bluetooth" && supported === false)
                      }
                      onClick={() => void muse.connect()}
                    >
                      {muse.status === "connecting" ? "Connecting…" : "Connect"}
                    </Button>
                  </>
                )}
              </ListRow>
            </Card>
          </section>
          <section>
            <SectionTitle>Session</SectionTitle>
            <Card className="flex flex-col gap-4">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Morning rest"
                />
              </Field>
              <Field
                label="Task"
                hint="Optional; protocols with stimuli come later."
              >
                <Select
                  value={taskLabel}
                  onChange={(e) => setTaskLabel(e.target.value)}
                >
                  <option value="">Free recording</option>
                  {TASK_LABELS.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                size="lg"
                disabled={!canStart}
                onClick={() => muse.startRecording()}
              >
                Start recording
              </Button>
              <p className="type-caption text-ink-3">
                {!connected ? (
                  "Connect a headband first."
                ) : muse.allGood ? (
                  "All four electrodes read good."
                ) : override ? (
                  "Recording without four green lights."
                ) : (
                  <>
                    Waiting for four green lights ·{" "}
                    <button
                      type="button"
                      className="font-medium text-ink underline-offset-2 hover:underline"
                      onClick={() => setOverride(true)}
                    >
                      record anyway
                    </button>
                  </>
                )}
              </p>
            </Card>
          </section>
        </div>
      </div>
      {stopped && (
        <SessionSheet session={stopped} onClose={() => setStopped(null)} />
      )}
    </main>
  );
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The recording moment: no navigation, the signal as big as the screen allows,
 * contact quality always in view (a loose electrode is the one thing worth
 * interrupting for), and one way out that leads to the summary sheet before
 * anything is uploaded.
 */
function LiveSession({
  muse,
  title,
  taskLabel,
  onStop,
}: {
  muse: ReturnType<typeof useMuse>;
  title: string;
  taskLabel: string;
  onStop: () => void;
}) {
  const levels = EEG_CHANNELS.map((c) => muse.quality[c].level);
  const loose = EEG_CHANNELS.filter(
    (_, i) => levels[i] !== "good" && levels[i] !== "unknown"
  );
  const waiting = levels.every((l) => l === "unknown");
  return (
    <main className="enter-fade flex min-h-[100svh] flex-col gap-6 px-6 py-6 md:px-10">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="type-eyebrow inline-flex h-8 items-center gap-2 rounded-full bg-danger-soft px-3.5 text-danger">
            <span className="relative h-2 w-2 rounded-full bg-danger">
              <span className="ping absolute inset-0 text-danger" />
            </span>
            Rec
          </span>
          <span
            className="type-figure text-[22px]"
            aria-label="Elapsed"
            role="timer"
          >
            {clock(muse.recordingSeconds)}
          </span>
        </div>
        <div className="min-w-0 text-center">
          <p className="truncate font-semibold">{title}</p>
          <p className="type-caption text-ink-3">
            {taskLabel ? taskLabel.replaceAll("_", " ") : "Free recording"} ·{" "}
            {muse.deviceName ?? "Muse"}
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={onStop}>
            <Icon name="stop" /> End session
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <SectionTitle>Signal</SectionTitle>
          <LiveSignal getRecent={muse.getRecent} active height={440} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="type-eyebrow text-ink-3">Contact</h2>
              <span
                className={
                  "type-caption " +
                  (loose.length
                    ? "text-warn"
                    : waiting
                      ? "text-ink-3"
                      : "text-ok")
                }
              >
                {loose.length
                  ? `${loose.join(", ")} not good`
                  : waiting
                    ? "Waiting for signal"
                    : "All good"}
              </span>
            </div>
            <HeadbandDiagram quality={muse.quality} />
          </Card>
          <Card inset>
            <KeyValue
              label="Battery"
              value={
                muse.batteryPercent !== null ? `${muse.batteryPercent}%` : "—"
              }
              mono
            />
            <KeyValue
              label="Packets"
              value={`${muse.packetRate.toFixed(0)} / s · ${muse.timeline?.lostPackets ?? 0} lost`}
              mono
            />
          </Card>
          <p className="type-caption text-ink-3">
            Ending shows a summary before anything is uploaded.
          </p>
        </div>
      </div>
    </main>
  );
}

function BrowserStatus({ supported }: { supported: boolean | null }) {
  if (supported === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
      <span
        className={
          "h-2 w-2 rounded-full " + (supported ? "bg-ok" : "bg-danger")
        }
      />
      {supported ? "Web Bluetooth ready" : "Web Bluetooth unavailable"}
    </span>
  );
}

/** First-class state, not an error: the browser simply lacks Web Bluetooth. */
function Unsupported() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="type-title">This browser can&apos;t talk to the Muse.</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-2">
        Web Bluetooth is available in Chrome and Edge on a computer. Open Brain
        Trails there to record, or upload a file exported from Mind Monitor.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/recordings" className={buttonClass()}>
          Upload a file instead
        </Link>
      </div>
    </main>
  );
}
