"use client";

/**
 * React hook that owns one Muse connection for the record page.
 *
 * Samples are appended to per-channel ring buffers held in refs (a packet
 * arrives every 47 ms; re-rendering on each would be wasteful), while the
 * React state is refreshed once a second with what the UI actually displays:
 * quality lights, packet statistics, battery. Charts read the buffers
 * directly through `getRecent`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MuseDevice } from "./device";
import { EEG_CHANNELS, SAMPLE_RATE_HZ, type EegChannel } from "./protocol";
import { assessChannel, type ChannelQuality } from "./quality";
import {
  ExtrasRecorder,
  SessionRecorder,
  type ExtraStream,
  type SessionCapture,
} from "./session";
import { PacketTimeline, type TimelineStats } from "./timeline";

export type MuseStatus = "idle" | "connecting" | "connected" | "error";

export interface MuseState {
  status: MuseStatus;
  error: string | null;
  deviceName: string | null;
  batteryPercent: number | null;
  quality: Record<EegChannel, ChannelQuality>;
  timeline: TimelineStats | null;
  /** Packets per second over the last refresh interval. */
  packetRate: number;
  isRecording: boolean;
  /** Seconds captured so far on the device clock (refreshed once a second). */
  recordingSeconds: number;
  /** Latest readings of the other sensors, refreshed once a second. */
  sensors: SensorReadings;
}

export interface SensorReadings {
  /** Acceleration magnitude in g (about 1 at rest). */
  accG: number | null;
  /** Angular speed magnitude in degrees per second. */
  gyroDps: number | null;
  /** Last infrared PPG value (raw ADC units). */
  ppgInfrared: number | null;
  motionPackets: number;
  ppgPackets: number;
}

const noSensors = (): SensorReadings => ({
  accG: null,
  gyroDps: null,
  ppgInfrared: null,
  motionPackets: 0,
  ppgPackets: 0,
});

const BUFFER_SECONDS = 12;
const BUFFER_SAMPLES = BUFFER_SECONDS * SAMPLE_RATE_HZ;
const REFRESH_MS = 1000;
const QUALITY_WINDOW_SAMPLES = 2 * SAMPLE_RATE_HZ;

const unknownQuality = (): Record<EegChannel, ChannelQuality> =>
  Object.fromEntries(
    EEG_CHANNELS.map((c) => [
      c,
      { level: "unknown", stdUv: null, hint: "Waiting for signal" },
    ])
  ) as Record<EegChannel, ChannelQuality>;

/** Fixed-size ring of the most recent samples for one channel. */
class Ring {
  private data = new Float32Array(BUFFER_SAMPLES);
  private head = 0;
  private filled = 0;
  push(samples: ArrayLike<number>): void {
    for (let i = 0; i < samples.length; i++) {
      this.data[this.head] = samples[i];
      this.head = (this.head + 1) % BUFFER_SAMPLES;
      if (this.filled < BUFFER_SAMPLES) this.filled += 1;
    }
  }
  /** The last `n` samples in chronological order (fewer if not filled yet). */
  recent(n: number): Float32Array {
    const count = Math.min(n, this.filled);
    const out = new Float32Array(count);
    let idx = (this.head - count + BUFFER_SAMPLES) % BUFFER_SAMPLES;
    for (let i = 0; i < count; i++) {
      out[i] = this.data[idx];
      idx = (idx + 1) % BUFFER_SAMPLES;
    }
    return out;
  }
  clear(): void {
    this.head = 0;
    this.filled = 0;
  }
}

/**
 * Drive a {@link MuseDevice}. The factory is called on `connect()` so the page
 * decides between the real headband and the simulator at click time.
 */
export function useMuse(createDevice: () => MuseDevice) {
  const [state, setState] = useState<MuseState>({
    status: "idle",
    error: null,
    deviceName: null,
    batteryPercent: null,
    quality: unknownQuality(),
    timeline: null,
    packetRate: 0,
    isRecording: false,
    recordingSeconds: 0,
    sensors: noSensors(),
  });
  const recorderRef = useRef<SessionRecorder | null>(null);
  const extrasRef = useRef<ExtrasRecorder | null>(null);
  const sensorsRef = useRef<SensorReadings>(noSensors());
  const deviceRef = useRef<MuseDevice | null>(null);
  const rings = useMemo(
    () =>
      Object.fromEntries(EEG_CHANNELS.map((c) => [c, new Ring()])) as Record<
        EegChannel,
        Ring
      >,
    []
  );
  const timelineRef = useRef(new PacketTimeline());
  const batteryRef = useRef<number | null>(null);
  const packetsSinceRefresh = useRef(0);
  const unsubscribe = useRef<(() => void)[]>([]);

  const teardown = useCallback(() => {
    for (const off of unsubscribe.current) off();
    unsubscribe.current = [];
    deviceRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (deviceRef.current) return;
    setState((s) => ({ ...s, status: "connecting", error: null }));
    const device = createDevice();
    deviceRef.current = device;
    for (const ring of Object.values(rings)) ring.clear();
    timelineRef.current = new PacketTimeline();
    sensorsRef.current = noSensors();
    unsubscribe.current.push(
      device.on("eeg", ({ channel, packet, hostMs }) => {
        rings[channel].push(packet.samples);
        recorderRef.current?.feed(channel, packet.counter, packet.samples);
        // The four electrodes share one counter; anchor the timeline on the first.
        if (channel === EEG_CHANNELS[0]) {
          timelineRef.current.push(packet.counter, hostMs);
          packetsSinceRefresh.current += 1;
        }
      }),
      device.on("motion", ({ kind, packet, hostMs }) => {
        const v = packet.samples;
        const mag = Math.hypot(v[6], v[7], v[8]); // last of the three readings
        if (kind === "acc") sensorsRef.current.accG = mag;
        else sensorsRef.current.gyroDps = mag;
        sensorsRef.current.motionPackets += 1;
        extrasRef.current?.feed(kind, packet.counter, packet.samples, hostMs);
      }),
      device.on("ppg", ({ channel, packet, hostMs }) => {
        if (channel === "infrared")
          sensorsRef.current.ppgInfrared =
            packet.samples[packet.samples.length - 1];
        sensorsRef.current.ppgPackets += 1;
        extrasRef.current?.feed(
          `ppg_${channel}` as ExtraStream,
          packet.counter,
          packet.samples,
          hostMs
        );
      }),
      device.on("telemetry", (t) => {
        batteryRef.current = Math.round(t.batteryPercent);
      }),
      device.on("disconnected", () => {
        teardown();
        setState((s) => ({
          ...s,
          status: "idle",
          deviceName: null,
          packetRate: 0,
        }));
      })
    );
    try {
      await device.connect();
      setState((s) => ({ ...s, status: "connected", deviceName: device.name }));
    } catch (err) {
      teardown();
      const message =
        err instanceof DOMException && err.name === "NotFoundError"
          ? "No headband selected."
          : err instanceof Error
            ? err.message
            : "Could not connect.";
      setState((s) => ({ ...s, status: "error", error: message }));
    }
  }, [createDevice, rings, teardown]);

  const disconnect = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return;
    teardown();
    await device.disconnect();
    setState((s) => ({
      ...s,
      status: "idle",
      deviceName: null,
      packetRate: 0,
    }));
  }, [teardown]);

  // One refresh per second: quality, packet statistics, battery.
  useEffect(() => {
    if (state.status !== "connected") return;
    const id = setInterval(() => {
      const quality = Object.fromEntries(
        EEG_CHANNELS.map((c) => [
          c,
          assessChannel(rings[c].recent(QUALITY_WINDOW_SAMPLES)),
        ])
      ) as Record<EegChannel, ChannelQuality>;
      const packetRate = packetsSinceRefresh.current / (REFRESH_MS / 1000);
      packetsSinceRefresh.current = 0;
      setState((s) => ({
        ...s,
        quality,
        packetRate,
        batteryPercent: batteryRef.current,
        timeline: timelineRef.current.stats(),
        recordingSeconds: recorderRef.current?.seconds ?? 0,
        sensors: { ...sensorsRef.current },
      }));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [state.status, rings]);

  // Release the headband if the page unmounts mid-session.
  useEffect(() => () => void deviceRef.current?.disconnect(), []);

  /** Last `seconds` of every channel, chronological, for the live chart. */
  const getRecent = useCallback(
    (seconds: number) =>
      Object.fromEntries(
        EEG_CHANNELS.map((c) => [
          c,
          rings[c].recent(Math.round(seconds * SAMPLE_RATE_HZ)),
        ])
      ) as Record<EegChannel, Float32Array>,
    [rings]
  );

  /** Begin capturing packets into a session (no-op while already recording). */
  const startRecording = useCallback(() => {
    if (recorderRef.current) return;
    recorderRef.current = new SessionRecorder();
    extrasRef.current = new ExtrasRecorder();
    setState((s) => ({ ...s, isRecording: true, recordingSeconds: 0 }));
  }, []);

  /** Close the capture and return it with the timing snapshot for the file header. */
  const stopRecording = useCallback((): {
    capture: SessionCapture;
    timeline: TimelineStats;
    extras: ExtrasRecorder;
  } | null => {
    const recorder = recorderRef.current;
    const extras = extrasRef.current;
    if (!recorder || !extras) return null;
    recorderRef.current = null;
    extrasRef.current = null;
    setState((s) => ({ ...s, isRecording: false }));
    return {
      capture: recorder.stop(),
      timeline: timelineRef.current.stats(),
      extras,
    };
  }, []);

  const allGood = EEG_CHANNELS.every((c) => state.quality[c].level === "good");
  return {
    ...state,
    allGood,
    connect,
    disconnect,
    getRecent,
    startRecording,
    stopRecording,
  };
}
