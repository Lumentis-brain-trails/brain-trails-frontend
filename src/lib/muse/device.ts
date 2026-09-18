/**
 * Muse device drivers behind one small interface.
 *
 * `BluetoothMuse` talks to a real headband through Web Bluetooth (Chrome and
 * Edge on desktop). `SimulatedMuse` produces a plausible EEG stream with the
 * same packet shape and counters, so the record page, the timeline and the
 * quality lights can be exercised in tests, in CI and on machines without a
 * headset. The page never depends on which one it got.
 */
import {
  ACCELEROMETER_CHARACTERISTIC,
  ACCELEROMETER_SCALE,
  CONTROL_CHARACTERISTIC,
  decodeEegPacket,
  decodeImuPacket,
  decodePpgPacket,
  decodeTelemetry,
  GYROSCOPE_CHARACTERISTIC,
  GYROSCOPE_SCALE,
  IMU_RATE_HZ,
  IMU_SAMPLES_PER_PACKET,
  PPG_CHANNELS,
  PPG_CHARACTERISTICS,
  PPG_RATE_HZ,
  PPG_SAMPLES_PER_PACKET,
  type ImuPacket,
  type PpgChannel,
  type PpgPacket,
  EEG_CHANNELS,
  EEG_CHARACTERISTICS,
  encodeCommand,
  HALT_COMMAND,
  MUSE_SERVICE,
  SAMPLE_RATE_HZ,
  SAMPLES_PER_PACKET,
  START_SEQUENCE,
  TELEMETRY_CHARACTERISTIC,
  type EegChannel,
  type EegPacket,
  type Telemetry,
} from "./protocol";

/** One EEG notification as delivered to listeners, stamped on arrival. */
export interface EegEvent {
  channel: EegChannel;
  packet: EegPacket;
  /** `performance.now()` at arrival: the host-side anchor for the timeline. */
  hostMs: number;
}

/** Accelerometer or gyroscope notification, stamped on arrival. */
export interface MotionEvent {
  kind: "acc" | "gyro";
  packet: ImuPacket;
  hostMs: number;
}

/** PPG notification for one optical channel, stamped on arrival. */
export interface PpgEvent {
  channel: PpgChannel;
  packet: PpgPacket;
  hostMs: number;
}

export interface MuseListeners {
  eeg: (event: EegEvent) => void;
  motion: (event: MotionEvent) => void;
  ppg: (event: PpgEvent) => void;
  telemetry: (t: Telemetry) => void;
  disconnected: () => void;
}

/** What a driver must offer; kept minimal on purpose. */
export interface MuseDevice {
  /** Human-readable name, available after `connect()`. */
  readonly name: string;
  /** Pair, subscribe to EEG and telemetry, and start streaming. */
  connect(): Promise<void>;
  /** Stop streaming and release the link. Safe to call twice. */
  disconnect(): Promise<void>;
  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void;
}

/** True when this browser exposes Web Bluetooth (Chrome/Edge on desktop). */
export function isWebBluetoothSupported(
  nav: Navigator | undefined = globalThis.navigator
): boolean {
  return (
    !!nav &&
    "bluetooth" in nav &&
    typeof nav.bluetooth?.requestDevice === "function"
  );
}

/** Tiny typed emitter shared by both drivers. */
class Emitter {
  private listeners: { [K in keyof MuseListeners]: Set<MuseListeners[K]> } = {
    eeg: new Set(),
    motion: new Set(),
    ppg: new Set(),
    telemetry: new Set(),
    disconnected: new Set(),
  };
  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }
  emit<K extends keyof MuseListeners>(
    event: K,
    ...args: Parameters<MuseListeners[K]>
  ): void {
    for (const l of this.listeners[event])
      (l as (...a: Parameters<MuseListeners[K]>) => void)(...args);
  }
}

/** Real headband over Web Bluetooth. */
export class BluetoothMuse implements MuseDevice {
  private emitter = new Emitter();
  private device: BluetoothDevice | null = null;
  private control: BluetoothRemoteGATTCharacteristic | null = null;
  private subscriptions: BluetoothRemoteGATTCharacteristic[] = [];
  name = "Muse";

  constructor(private readonly bluetooth: Bluetooth = navigator.bluetooth) {}

  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void {
    return this.emitter.on(event, listener);
  }

  async connect(): Promise<void> {
    // The chooser only lists headbands; the service filter is what the Muse advertises.
    this.device = await this.bluetooth.requestDevice({
      filters: [{ services: [MUSE_SERVICE] }],
    });
    this.name = this.device.name ?? "Muse";
    const gatt = this.device.gatt;
    if (!gatt) throw new Error("This device does not expose GATT");
    this.device.addEventListener("gattserverdisconnected", () =>
      this.emitter.emit("disconnected")
    );
    const server = await gatt.connect();
    const service = await server.getPrimaryService(MUSE_SERVICE);
    this.control = await service.getCharacteristic(CONTROL_CHARACTERISTIC);

    for (const channel of EEG_CHANNELS) {
      const characteristic = await service.getCharacteristic(
        EEG_CHARACTERISTICS[channel]
      );
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value) return;
        this.emitter.emit("eeg", {
          channel,
          packet: decodeEegPacket(value),
          hostMs: performance.now(),
        });
      });
      await characteristic.startNotifications();
      this.subscriptions.push(characteristic);
    }
    // Motion and PPG: kept for later analyses, not used by the pipeline yet.
    for (const [uuid, kind, scale] of [
      [ACCELEROMETER_CHARACTERISTIC, "acc", ACCELEROMETER_SCALE],
      [GYROSCOPE_CHARACTERISTIC, "gyro", GYROSCOPE_SCALE],
    ] as const) {
      const characteristic = await service.getCharacteristic(uuid);
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (value)
          this.emitter.emit("motion", {
            kind,
            packet: decodeImuPacket(value, scale),
            hostMs: performance.now(),
          });
      });
      await characteristic.startNotifications();
      this.subscriptions.push(characteristic);
    }
    for (const channel of PPG_CHANNELS) {
      const characteristic = await service.getCharacteristic(
        PPG_CHARACTERISTICS[channel]
      );
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (value)
          this.emitter.emit("ppg", {
            channel,
            packet: decodePpgPacket(value),
            hostMs: performance.now(),
          });
      });
      await characteristic.startNotifications();
      this.subscriptions.push(characteristic);
    }
    const telemetry = await service.getCharacteristic(TELEMETRY_CHARACTERISTIC);
    telemetry.addEventListener("characteristicvaluechanged", (ev) => {
      const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) this.emitter.emit("telemetry", decodeTelemetry(value));
    });
    await telemetry.startNotifications();
    this.subscriptions.push(telemetry);

    for (const command of START_SEQUENCE) await this.send(command);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.control && this.device?.gatt?.connected)
        await this.send(HALT_COMMAND);
    } catch {
      /* the link may already be gone; halting is best effort */
    }
    this.subscriptions = [];
    this.control = null;
    this.device?.gatt?.disconnect();
    this.device = null;
  }

  private async send(command: string): Promise<void> {
    if (!this.control) throw new Error("Not connected");
    await this.control.writeValue(encodeCommand(command));
  }
}

/** Options for the synthetic headband. */
export interface SimulatedMuseOptions {
  /** Emit packets on a timer (default) or only when `tick()` is called (tests). */
  autoplay?: boolean;
  /** Per-channel behaviour: a flat electrode simulates a lost contact. */
  flatChannels?: EegChannel[];
  /** Alpha (10 Hz) amplitude in microvolts. */
  alphaUv?: number;
  /** Start counter, to exercise wrap-around. */
  startCounter?: number;
}

/**
 * Synthetic Muse: 10 Hz alpha plus pink-ish noise and slow drift, twelve
 * samples per packet, counters that wrap like the firmware's, telemetry once
 * a second. Deterministic given the seed so tests stay stable.
 */
export class SimulatedMuse implements MuseDevice {
  private emitter = new Emitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter: number;
  private seed = 12345;
  private packetsSinceTelemetry = 0;
  private imuCounter = 0;
  private ppgCounter = 0;
  private imuDueMs = 0;
  private ppgDueMs = 0;
  readonly name = "Muse-SIM";

  constructor(private readonly options: SimulatedMuseOptions = {}) {
    this.counter = options.startCounter ?? 0;
  }

  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void {
    return this.emitter.on(event, listener);
  }

  async connect(): Promise<void> {
    if (this.options.autoplay ?? true) {
      const periodMs = (SAMPLES_PER_PACKET / SAMPLE_RATE_HZ) * 1000;
      this.timer = setInterval(() => this.tick(), periodMs);
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emitter.emit("disconnected");
  }

  /** Emit one packet per channel (and telemetry every ~21 packets). */
  tick(hostMs: number = performance.now()): void {
    const counter = this.counter;
    this.counter = (this.counter + 1) & 0xffff;
    const flat = new Set(this.options.flatChannels ?? []);
    const alpha = this.options.alphaUv ?? 20;
    for (const channel of EEG_CHANNELS) {
      const samples = new Float32Array(SAMPLES_PER_PACKET);
      if (!flat.has(channel)) {
        for (let i = 0; i < SAMPLES_PER_PACKET; i++) {
          const t = (counter * SAMPLES_PER_PACKET + i) / SAMPLE_RATE_HZ;
          samples[i] =
            alpha * Math.sin(2 * Math.PI * 10 * t) +
            5 * Math.sin(2 * Math.PI * 0.3 * t) +
            8 * (this.random() - 0.5);
        }
      }
      this.emitter.emit("eeg", {
        channel,
        packet: { counter, samples },
        hostMs,
      });
    }
    this.emitExtras(counter, hostMs);
    if (++this.packetsSinceTelemetry >= 21) {
      this.packetsSinceTelemetry = 0;
      this.emitter.emit("telemetry", {
        sequence: counter,
        batteryPercent: 76,
        voltageMv: 3900,
        temperatureC: 30,
      });
    }
  }

  /** Motion at 52 Hz and PPG at 64 Hz, paced against the 256 Hz EEG ticks. */
  private emitExtras(eegCounter: number, hostMs: number): void {
    const tickMs = (SAMPLES_PER_PACKET / SAMPLE_RATE_HZ) * 1000;
    const tSec = (eegCounter * SAMPLES_PER_PACKET) / SAMPLE_RATE_HZ;
    this.imuDueMs += tickMs;
    const imuPeriod = (IMU_SAMPLES_PER_PACKET / IMU_RATE_HZ) * 1000;
    while (this.imuDueMs >= imuPeriod) {
      this.imuDueMs -= imuPeriod;
      const acc = new Float32Array(9);
      const gyro = new Float32Array(9);
      for (let i = 0; i < 3; i++) {
        acc[i * 3] = 0.02 * Math.sin(tSec);
        acc[i * 3 + 1] = 0.01;
        acc[i * 3 + 2] = 1 + 0.01 * (this.random() - 0.5); // gravity on z
        gyro[i * 3] = 2 * Math.sin(0.5 * tSec);
        gyro[i * 3 + 1] = 0.5 * (this.random() - 0.5);
        gyro[i * 3 + 2] = 0;
      }
      const counter = this.imuCounter;
      this.imuCounter = (this.imuCounter + 1) & 0xffff;
      this.emitter.emit("motion", {
        kind: "acc",
        packet: { counter, samples: acc },
        hostMs,
      });
      this.emitter.emit("motion", {
        kind: "gyro",
        packet: { counter, samples: gyro },
        hostMs,
      });
    }
    this.ppgDueMs += tickMs;
    const ppgPeriod = (PPG_SAMPLES_PER_PACKET / PPG_RATE_HZ) * 1000;
    while (this.ppgDueMs >= ppgPeriod) {
      this.ppgDueMs -= ppgPeriod;
      const counter = this.ppgCounter;
      this.ppgCounter = (this.ppgCounter + 1) & 0xffff;
      for (const channel of PPG_CHANNELS) {
        const samples = new Float32Array(PPG_SAMPLES_PER_PACKET);
        for (let i = 0; i < PPG_SAMPLES_PER_PACKET; i++) {
          const t = tSec + i / PPG_RATE_HZ;
          const pulse = Math.max(0, Math.sin(2 * Math.PI * (70 / 60) * t)); // ~70 bpm
          samples[i] =
            channel === "ambient"
              ? 5000
              : 200000 + 8000 * pulse + 500 * (this.random() - 0.5);
        }
        this.emitter.emit("ppg", {
          channel,
          packet: { counter, samples },
          hostMs,
        });
      }
    }
  }

  /** Small deterministic PRNG (mulberry32) so noise is reproducible. */
  private random(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
