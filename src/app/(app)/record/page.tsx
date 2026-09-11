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
  KeyValue,
  ListRow,
  SectionTitle,
} from "@/components/ui";
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
 * Record, step one of sprint 11: pair the Muse over Web Bluetooth, watch the
 * four contact lights and the live signal, see the device state. Recording
 * itself (protocol, markers, upload) lands in the next steps; the Start
 * button is shown disabled so the layout is final.
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
              <p className="text-ink-2">
                Recording, markers and upload arrive in the next step. For now
                this page is about wearing the band well.
              </p>
              <Button size="lg" disabled title="Not available yet">
                Start recording
              </Button>
              <p className="type-caption text-ink-3">
                {connected
                  ? muse.allGood
                    ? "All four electrodes read good."
                    : "Waiting for four green lights."
                  : "Connect a headband first."}
              </p>
            </Card>
          </section>
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
        <Link href="/recordings">
          <Button>Upload a file instead</Button>
        </Link>
      </div>
    </main>
  );
}
