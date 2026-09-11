"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ContactLights } from "@/components/ContactLights";
import { LiveSignal } from "@/components/LiveSignal";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
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
import { SAMPLE_RATE_HZ } from "@/lib/muse/protocol";
import { useMuse } from "@/lib/muse/useMuse";

const SIMULATOR_ALLOWED = process.env.NEXT_PUBLIC_APP_ENV !== "prod";

/**
 * Record (sprint 11): pair the Muse over Web Bluetooth, watch the four contact
 * lights and the live signal, then record a free session and upload it as a
 * canonical Brain Trails session file. Stimulus protocols and markers are a
 * later step.
 */
export default function RecordPage() {
  // Web Bluetooth support is a client-only fact: the server snapshot is null so
  // the server render and the first client render agree.
  const supported = useSyncExternalStore(
    () => () => {},
    () => isWebBluetoothSupported(),
    () => null
  );
  const [source, setSource] = useState<"bluetooth" | "simulated">("bluetooth");

  const createDevice = useCallback(
    (): MuseDevice =>
      source === "simulated" ? new SimulatedMuse() : new BluetoothMuse(),
    [source]
  );
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
      deviceName: muse.deviceName ?? "Muse",
      title: title.trim() || `Session ${new Date().toLocaleString()}`,
      taskLabel,
    });
  };

  if (supported === false && !SIMULATOR_ALLOWED) return <Unsupported />;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Record</h1>
          <p className="mt-1 text-ink-2">
            Wear the band, wait for four green lights, then start.
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
            <ContactLights quality={muse.quality} />
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
                    {muse.deviceName ?? "Muse 2"}
                  </div>
                  <div className="type-caption text-ink-3">
                    {source === "simulated"
                      ? "Simulated headband"
                      : "Bluetooth Low Energy"}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={muse.status === "connecting"}
                        onClick={() => {
                          setSource("simulated");
                        }}
                        aria-pressed={source === "simulated"}
                      >
                        Simulated
                      </Button>
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
                  disabled={muse.isRecording}
                />
              </Field>
              <Field
                label="Task"
                hint="Optional; protocols with stimuli come later."
              >
                <Select
                  value={taskLabel}
                  onChange={(e) => setTaskLabel(e.target.value)}
                  disabled={muse.isRecording}
                >
                  <option value="">Free recording</option>
                  {TASK_LABELS.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              {muse.isRecording ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 text-[15px] font-medium">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                    REC · {Math.floor(muse.recordingSeconds / 60)}:
                    {String(Math.floor(muse.recordingSeconds % 60)).padStart(
                      2,
                      "0"
                    )}
                  </span>
                  <Button variant="danger" onClick={stop}>
                    Stop
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  disabled={!canStart}
                  onClick={() => muse.startRecording()}
                >
                  Start recording
                </Button>
              )}
              <p className="type-caption text-ink-3">
                {!connected ? (
                  "Connect a headband first."
                ) : muse.isRecording ? (
                  "Stopping shows a summary before anything is uploaded."
                ) : muse.allGood ? (
                  "All four electrodes read good."
                ) : override ? (
                  "Recording without four green lights."
                ) : (
                  <>
                    Waiting for four green lights ·{" "}
                    <button
                      type="button"
                      className="text-accent underline-offset-2 hover:underline"
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
        <Link href="/recordings">
          <Button>Upload a file instead</Button>
        </Link>
      </div>
    </main>
  );
}
