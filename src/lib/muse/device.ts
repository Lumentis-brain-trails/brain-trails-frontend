/**
 * Muse device drivers behind one small interface.
 *
 * `BluetoothMuse` talks to a real headband through Web Bluetooth (Chrome and
 * Edge on desktop). Two generations are supported and they do not speak the
 * same protocol: the Muse 2 and Muse S (gen 2) notify once per electrode
 * (`protocol.ts`), the Muse S Athena multiplexes everything through one
 * characteristic (`athena.ts`). Which one is on the head is detected after the
 * GATT connection, not guessed from the advertised name.
 *
 * `SimulatedMuse` produces a plausible EEG stream with the same packet shape
 * and clock, so the record page, the timeline and the quality lights can be
 * exercised in tests, in CI and on machines without a headset.
 *
 * Whatever the source, listeners receive samples already placed on the
 * device's own clock: a packet carries the index of its first sample and as
 * many samples as that band sends. Nothing above this file knows how a
 * generation numbers its packets or how many samples it puts in one.
 */
import {
  ATHENA_AUX_CHARACTERISTIC,
  ATHENA_DATA_CHARACTERISTIC,
  ATHENA_MOTION_RATE_HZ,
  ATHENA_MOTION_SAMPLES,
  ATHENA_START_SEQUENCE,
  AthenaClock,
  decodeAthenaMessage,
} from "./athena";
import { MODEL_PROFILES, type ModelProfile, type MuseModel } from "./models";
import {
  ACCELEROMETER_CHARACTERISTIC,
  ACCELEROMETER_SCALE,
  CONTROL_CHARACTERISTIC,
  CounterClock,
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
  type PpgChannel,
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
  type Telemetry,
} from "./protocol";

/**
 * Samples of one stream, already positioned on the device clock.
 *
 * `sampleIndex` is the index of the first sample; a lost notification shows up
 * as a jump, which is how both the session file and the timeline account for
 * it. Motion packets count xyz readings, not the individual axes.
 */
export interface SamplePacket {
  sampleIndex: number;
  samples: Float32Array;
}

/** One EEG notification as delivered to listeners, stamped on arrival. */
export interface EegEvent {
  channel: EegChannel;
  packet: SamplePacket;
  /** `performance.now()` at arrival: the host-side anchor for the timeline. */
  hostMs: number;
}

/** Accelerometer or gyroscope notification, stamped on arrival. */
export interface MotionEvent {
  kind: "acc" | "gyro";
  packet: SamplePacket;
  hostMs: number;
}

/** PPG notification for one optical channel, stamped on arrival. */
export interface PpgEvent {
  channel: PpgChannel;
  packet: SamplePacket;
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
  /** Which generation this turned out to be; known after `connect()`. */
  readonly model: MuseModel;
  /** Pair, subscribe to EEG and telemetry, and start streaming. */
  connect(): Promise<void>;
  /** Stop streaming and release the link. Safe to call twice. */
  disconnect(): Promise<void>;
  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void;
}

/** The facts that differ between generations, for a connected device. */
export function profileOf(device: MuseDevice): ModelProfile {
  return MODEL_PROFILES[device.model];
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Real headband over Web Bluetooth, either generation. */
export class BluetoothMuse implements MuseDevice {
  private emitter = new Emitter();
  private device: BluetoothDevice | null = null;
  private control: BluetoothRemoteGATTCharacteristic | null = null;
  private subscriptions: BluetoothRemoteGATTCharacteristic[] = [];
  name = "Muse";
  model: MuseModel = "muse-2";

  constructor(private readonly bluetooth: Bluetooth = navigator.bluetooth) {}

  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void {
    return this.emitter.on(event, listener);
  }

  async connect(): Promise<void> {
    // The chooser only lists headbands. Athena firmware does not always put the
    // service in its advertisement, so the name is accepted as well and the
    // service is requested explicitly for the bands matched that way.
    this.device = await this.bluetooth.requestDevice({
      filters: [{ services: [MUSE_SERVICE] }, { namePrefix: "Muse" }],
      optionalServices: [MUSE_SERVICE],
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

    // Only the Athena carries the multiplexed data characteristic; on the older
    // bands asking for it is how we learn it is not there.
    const multiplexed = await optionalCharacteristic(
      service,
      ATHENA_DATA_CHARACTERISTIC
    );
    if (multiplexed) {
      this.model = "athena";
      await this.subscribeAthena(service, multiplexed);
    } else {
      this.model = "muse-2";
      await this.subscribeLegacy(service);
    }
  }

  /** Muse 2 / Muse S: one notify characteristic per electrode and per sensor. */
  private async subscribeLegacy(service: BluetoothRemoteGATTService) {
    const eegClock = new CounterClock();
    for (const channel of EEG_CHANNELS) {
      const characteristic = await service.getCharacteristic(
        EEG_CHARACTERISTICS[channel]
      );
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value) return;
        const { counter, samples } = decodeEegPacket(value);
        this.emitter.emit("eeg", {
          channel,
          packet: { sampleIndex: eegClock.next(counter), samples },
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
      const clock = new CounterClock(IMU_SAMPLES_PER_PACKET, true);
      const characteristic = await service.getCharacteristic(uuid);
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value) return;
        const { counter, samples } = decodeImuPacket(value, scale);
        this.emitter.emit("motion", {
          kind,
          packet: { sampleIndex: clock.next(counter), samples },
          hostMs: performance.now(),
        });
      });
      await characteristic.startNotifications();
      this.subscriptions.push(characteristic);
    }
    for (const channel of PPG_CHANNELS) {
      const clock = new CounterClock(PPG_SAMPLES_PER_PACKET, true);
      const characteristic = await service.getCharacteristic(
        PPG_CHARACTERISTICS[channel]
      );
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value) return;
        const { counter, samples } = decodePpgPacket(value);
        this.emitter.emit("ppg", {
          channel,
          packet: { sampleIndex: clock.next(counter), samples },
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

  /**
   * Athena: every stream arrives on one or two characteristics as tagged
   * subpackets. The optics stream (fNIRS and PPG) is left switched off by the
   * preset and skipped by the decoder, so what reaches the listeners is the
   * four electrodes and motion, exactly as from an older band.
   */
  private async subscribeAthena(
    service: BluetoothRemoteGATTService,
    data: BluetoothRemoteGATTCharacteristic
  ) {
    const eegClock = new AthenaClock(SAMPLE_RATE_HZ);
    const motionClock = new AthenaClock(ATHENA_MOTION_RATE_HZ);
    const handle = (ev: Event) => {
      const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      const hostMs = performance.now();
      for (const part of decodeAthenaMessage(value)) {
        if (part.sensor === "eeg") {
          const sampleIndex = eegClock.next(part.tick, part.sampleCount);
          for (const channel of EEG_CHANNELS)
            this.emitter.emit("eeg", {
              channel,
              packet: { sampleIndex, samples: part.channels[channel] },
              hostMs,
            });
        } else if (part.sensor === "motion") {
          const sampleIndex = motionClock.next(
            part.tick,
            ATHENA_MOTION_SAMPLES
          );
          this.emitter.emit("motion", {
            kind: "acc",
            packet: { sampleIndex, samples: part.acc },
            hostMs,
          });
          this.emitter.emit("motion", {
            kind: "gyro",
            packet: { sampleIndex, samples: part.gyro },
            hostMs,
          });
        } else {
          this.emitter.emit("telemetry", {
            sequence: 0,
            batteryPercent: part.batteryPercent,
            voltageMv: null,
            temperatureC: null,
          });
        }
      }
    };
    for (const characteristic of [
      data,
      await optionalCharacteristic(service, ATHENA_AUX_CHARACTERISTIC),
    ]) {
      if (!characteristic) continue;
      characteristic.addEventListener("characteristicvaluechanged", handle);
      await characteristic.startNotifications();
      this.subscriptions.push(characteristic);
    }
    for (const step of ATHENA_START_SEQUENCE) {
      await this.send(step.command);
      await wait(step.waitMs);
    }
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

/** `getCharacteristic`, but a characteristic this band lacks is not an error. */
async function optionalCharacteristic(
  service: BluetoothRemoteGATTService,
  uuid: string
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  try {
    return await service.getCharacteristic(uuid);
  } catch {
    return null;
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
  /**
   * Which generation to imitate. `athena` sends the Athena's shorter EEG
   * packets and no PPG, so the record page can be exercised against both
   * packet shapes without a headset.
   */
  model?: "muse-2" | "athena";
}

/** Athena EEG subpackets carry four samples per channel, not twelve. */
const ATHENA_SIM_SAMPLES_PER_PACKET = 4;

/**
 * Synthetic Muse: 10 Hz alpha plus pink-ish noise and slow drift, counters
 * that wrap like the firmware's, telemetry once a second. Deterministic given
 * the seed so tests stay stable.
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
  private readonly samplesPerPacket: number;
  private readonly telemetryEvery: number;
  readonly name: string;
  readonly model: MuseModel = "simulated";

  constructor(private readonly options: SimulatedMuseOptions = {}) {
    this.counter = options.startCounter ?? 0;
    this.samplesPerPacket =
      options.model === "athena"
        ? ATHENA_SIM_SAMPLES_PER_PACKET
        : SAMPLES_PER_PACKET;
    this.telemetryEvery = Math.round(SAMPLE_RATE_HZ / this.samplesPerPacket);
    this.name = options.model === "athena" ? "Athena-SIM" : "Muse-SIM";
  }

  on<K extends keyof MuseListeners>(
    event: K,
    listener: MuseListeners[K]
  ): () => void {
    return this.emitter.on(event, listener);
  }

  async connect(): Promise<void> {
    if (this.options.autoplay ?? true) {
      const periodMs = (this.samplesPerPacket / SAMPLE_RATE_HZ) * 1000;
      this.timer = setInterval(() => this.tick(), periodMs);
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emitter.emit("disconnected");
  }

  /** Emit one packet per channel (and telemetry about once a second). */
  tick(hostMs: number = performance.now()): void {
    const counter = this.counter;
    this.counter = (this.counter + 1) & 0xffff;
    const sampleIndex = counter * this.samplesPerPacket;
    const flat = new Set(this.options.flatChannels ?? []);
    const alpha = this.options.alphaUv ?? 20;
    for (const channel of EEG_CHANNELS) {
      const samples = new Float32Array(this.samplesPerPacket);
      if (!flat.has(channel)) {
        for (let i = 0; i < this.samplesPerPacket; i++) {
          const t = (sampleIndex + i) / SAMPLE_RATE_HZ;
          samples[i] =
            alpha * Math.sin(2 * Math.PI * 10 * t) +
            5 * Math.sin(2 * Math.PI * 0.3 * t) +
            8 * (this.random() - 0.5);
        }
      }
      this.emitter.emit("eeg", {
        channel,
        packet: { sampleIndex, samples },
        hostMs,
      });
    }
    this.emitExtras(sampleIndex, hostMs);
    if (++this.packetsSinceTelemetry >= this.telemetryEvery) {
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
  private emitExtras(eegSampleIndex: number, hostMs: number): void {
    const tickMs = (this.samplesPerPacket / SAMPLE_RATE_HZ) * 1000;
    const tSec = eegSampleIndex / SAMPLE_RATE_HZ;
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
      const sampleIndex = this.imuCounter * IMU_SAMPLES_PER_PACKET;
      this.imuCounter += 1;
      this.emitter.emit("motion", {
        kind: "acc",
        packet: { sampleIndex, samples: acc },
        hostMs,
      });
      this.emitter.emit("motion", {
        kind: "gyro",
        packet: { sampleIndex, samples: gyro },
        hostMs,
      });
    }
    if (this.options.model === "athena") return; // no PPG, as on the real band
    this.ppgDueMs += tickMs;
    const ppgPeriod = (PPG_SAMPLES_PER_PACKET / PPG_RATE_HZ) * 1000;
    while (this.ppgDueMs >= ppgPeriod) {
      this.ppgDueMs -= ppgPeriod;
      const sampleIndex = this.ppgCounter * PPG_SAMPLES_PER_PACKET;
      this.ppgCounter += 1;
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
          packet: { sampleIndex, samples },
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
