/**
 * Muse 2 Bluetooth Low Energy protocol: identifiers, command framing and packet
 * decoding. Pure functions only, so every byte-level rule is unit-testable
 * without a headset. Facts verified against the muse-js reference
 * implementation (MIT) and Interaxon's public packet layout.
 */

/** GATT primary service advertised by every Muse headband. */
export const MUSE_SERVICE = 0xfe8d;

/** Control characteristic: commands go in, status/JSON replies come out. */
export const CONTROL_CHARACTERISTIC = "273e0001-4c4d-454d-96be-f03bac821358";

/** Telemetry (battery, voltage, temperature), notified about once a second. */
export const TELEMETRY_CHARACTERISTIC = "273e000b-4c4d-454d-96be-f03bac821358";

/**
 * One notify characteristic per EEG electrode, in the device's own order.
 * Only the four scalp electrodes are used: AUX (273e0007) is the unpopulated
 * fifth input on a Muse 2 and is not subscribed.
 */
export const EEG_CHARACTERISTICS: Record<EegChannel, string> = {
  TP9: "273e0003-4c4d-454d-96be-f03bac821358",
  AF7: "273e0004-4c4d-454d-96be-f03bac821358",
  AF8: "273e0005-4c4d-454d-96be-f03bac821358",
  TP10: "273e0006-4c4d-454d-96be-f03bac821358",
};

/** Channel order used everywhere downstream (matches the backend pipeline). */
export const EEG_CHANNELS = ["TP9", "AF7", "AF8", "TP10"] as const;
export type EegChannel = (typeof EEG_CHANNELS)[number];

/** Nominal EEG sampling rate of the Muse 2. */
export const SAMPLE_RATE_HZ = 256;

/** Samples carried by one EEG notification. */
export const SAMPLES_PER_PACKET = 12;

/** Accelerometer and gyroscope: 52 Hz, three xyz samples per notification. */
export const ACCELEROMETER_CHARACTERISTIC =
  "273e000a-4c4d-454d-96be-f03bac821358";
export const GYROSCOPE_CHARACTERISTIC = "273e0009-4c4d-454d-96be-f03bac821358";
export const IMU_RATE_HZ = 52;
export const IMU_SAMPLES_PER_PACKET = 3;
/** Scale factors from muse-js: accelerometer in g, gyroscope in degrees/s. */
export const ACCELEROMETER_SCALE = 0.0000610352;
export const GYROSCOPE_SCALE = 0.0074768;

/** Optical heart-rate sensor (PPG): 64 Hz, six 24-bit samples per notification. */
export const PPG_CHANNELS = ["ambient", "infrared", "red"] as const;
export type PpgChannel = (typeof PPG_CHANNELS)[number];
export const PPG_CHARACTERISTICS: Record<PpgChannel, string> = {
  ambient: "273e000f-4c4d-454d-96be-f03bac821358",
  infrared: "273e0010-4c4d-454d-96be-f03bac821358",
  red: "273e0011-4c4d-454d-96be-f03bac821358",
};
export const PPG_RATE_HZ = 64;
export const PPG_SAMPLES_PER_PACKET = 6;

/**
 * Preset p50 streams EEG, PPG and motion on a Muse 2 (p21 would leave the PPG
 * off). The command sequence mirrors muse-js: halt, preset, status request,
 * then resume streaming.
 */
export const START_SEQUENCE = ["h", "p50", "s", "d"] as const;
export const HALT_COMMAND = "h";

/**
 * Frame a command the way the firmware expects: one length byte, the ASCII
 * command, a trailing newline. The length counts everything after itself.
 */
export function encodeCommand(command: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(`X${command}\n`);
  bytes[0] = bytes.length - 1;
  return bytes;
}

/**
 * Decode a control-characteristic reply: a length byte followed by that many
 * ASCII bytes (the firmware pads the 20-byte notification with garbage).
 */
export function decodeResponse(data: DataView): string {
  const length = data.getUint8(0);
  const bytes = new Uint8Array(data.buffer, data.byteOffset + 1, length);
  return new TextDecoder().decode(bytes);
}

/** Decoded content of one EEG notification for one electrode. */
export interface EegPacket {
  /** 16-bit packet counter kept by the headset; wraps at 65535. */
  counter: number;
  /** Twelve consecutive samples in microvolts. */
  samples: Float32Array;
}

/**
 * Unpack 18 bytes of packed 12-bit unsigned ADC values (two per three bytes).
 * Exported for tests; callers use {@link decodeEegPacket}.
 */
export function unpack12Bit(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 3) {
    out.push((bytes[i] << 4) | (bytes[i + 1] >> 4));
    if (i + 2 < bytes.length) {
      out.push(((bytes[i + 1] & 0x0f) << 8) | bytes[i + 2]);
    }
  }
  return out;
}

/** Microvolts per ADC count: 1682 uV full scale over 12 bits, zero at 2048. */
export const UV_PER_COUNT = 0.48828125;
const ADC_ZERO = 0x800;

/**
 * Decode a 20-byte EEG notification: big-endian counter, then twelve packed
 * 12-bit samples converted to microvolts around the mid-scale reference.
 * Throws on a malformed length so a firmware surprise is loud, not silent.
 */
export function decodeEegPacket(data: DataView): EegPacket {
  if (data.byteLength !== 20) {
    throw new Error(`EEG packet must be 20 bytes, got ${data.byteLength}`);
  }
  const counter = data.getUint16(0, false);
  const raw = unpack12Bit(new Uint8Array(data.buffer, data.byteOffset + 2, 18));
  const samples = new Float32Array(SAMPLES_PER_PACKET);
  for (let i = 0; i < SAMPLES_PER_PACKET; i++) {
    samples[i] = UV_PER_COUNT * (raw[i] - ADC_ZERO);
  }
  return { counter, samples };
}

/** Battery and thermal telemetry, one notification per second. */
export interface Telemetry {
  sequence: number;
  /** State of charge, 0..100. */
  batteryPercent: number;
  /** Fuel-gauge voltage in millivolts. */
  voltageMv: number;
  temperatureC: number;
}

/** Decode a telemetry notification (scale factors from muse-js). */
export function decodeTelemetry(data: DataView): Telemetry {
  return {
    sequence: data.getUint16(0, false),
    batteryPercent: data.getUint16(2, false) / 512,
    voltageMv: data.getUint16(4, false) * 2.2,
    temperatureC: data.getUint16(8, false),
  };
}

/** One motion notification: three consecutive xyz readings. */
export interface ImuPacket {
  counter: number;
  /** Flat [x0,y0,z0, x1,y1,z1, x2,y2,z2] in g or degrees/s. */
  samples: Float32Array;
}

/** Decode an accelerometer/gyroscope notification (int16 big-endian, scaled). */
export function decodeImuPacket(data: DataView, scale: number): ImuPacket {
  if (data.byteLength < 20)
    throw new Error(`IMU packet must be 20 bytes, got ${data.byteLength}`);
  const samples = new Float32Array(9);
  for (let i = 0; i < 3; i++) {
    const base = 2 + i * 6;
    samples[i * 3] = scale * data.getInt16(base, false);
    samples[i * 3 + 1] = scale * data.getInt16(base + 2, false);
    samples[i * 3 + 2] = scale * data.getInt16(base + 4, false);
  }
  return { counter: data.getUint16(0, false), samples };
}

/** One PPG notification for one optical channel. */
export interface PpgPacket {
  counter: number;
  /** Six raw 24-bit ADC values (unitless light intensity). */
  samples: Float32Array;
}

/** Decode a PPG notification: counter then six unsigned 24-bit big-endian values. */
export function decodePpgPacket(data: DataView): PpgPacket {
  if (data.byteLength < 20)
    throw new Error(`PPG packet must be 20 bytes, got ${data.byteLength}`);
  const samples = new Float32Array(PPG_SAMPLES_PER_PACKET);
  for (let i = 0; i < PPG_SAMPLES_PER_PACKET; i++) {
    const o = 2 + i * 3;
    samples[i] =
      (data.getUint8(o) << 16) |
      (data.getUint8(o + 1) << 8) |
      data.getUint8(o + 2);
  }
  return { counter: data.getUint16(0, false), samples };
}
