/**
 * Muse S Athena Bluetooth Low Energy protocol: identifiers, presets and packet
 * decoding. Pure functions only, like `protocol.ts`, so every byte-level rule
 * is unit-testable without a headset.
 *
 * The Athena is not the Muse 2 with extra sensors: it speaks a different wire
 * format. There is no characteristic per electrode and no 12-bit packing.
 * Every sensor is multiplexed through one notify characteristic as a chain of
 * packets, each carrying a 14-byte header and one or more tagged subpackets,
 * with 14-bit LSB-first EEG samples and a 256 kHz device clock in the header.
 *
 * Facts reverse-engineered by the amused-py (MIT) and OpenMuse (MIT) projects
 * and cross-checked between them:
 * https://github.com/Amused-EEG/amused-py -- https://github.com/DominiqueMakowski/OpenMuse
 *
 * **fNIRS is deliberately not recorded.** The Athena's optode array and its
 * PPG share one "optics" stream, and no preset gives us the motion we need
 * without also switching that stream on, so it arrives and is discarded here:
 * optics tags are framed -- a packet containing one has to be walked over to
 * reach the subpackets behind it -- and then dropped. A session file is the
 * same four electrodes plus motion whichever headband produced it.
 */
import { EEG_CHANNELS, SAMPLE_RATE_HZ, type EegChannel } from "./protocol";

/** Same 16-bit GATT service as the older bands; only the contents differ. */
export { MUSE_SERVICE, CONTROL_CHARACTERISTIC } from "./protocol";

/**
 * The multiplexed data characteristic. Its presence in the service is how the
 * driver tells an Athena from a Muse 2 without trusting the advertised name.
 */
export const ATHENA_DATA_CHARACTERISTIC =
  "273e0013-4c4d-454d-96be-f03bac821358";

/**
 * Second data characteristic. Firmware revisions disagree about which streams
 * come out of which one, and the parser is tag-driven, so we subscribe to both
 * and decode whatever arrives.
 */
export const ATHENA_AUX_CHARACTERISTIC = "273e0014-4c4d-454d-96be-f03bac821358";

/**
 * The preset the band is primed with before it is moved to the streaming one.
 * On its own it does not stream: it is the first half of the two-step start
 * below.
 */
export const ATHENA_PRIMING_PRESET = "p21";

/**
 * The streaming preset: EEG at 256 Hz, accelerometer and gyroscope at 52 Hz,
 * battery -- and the optode array, which we cannot switch off without also
 * losing the motion we need. So the optics arrive on the wire and are thrown
 * away in {@link decodeSubpacket}: **no fNIRS and no PPG ever reaches a file**,
 * which is what a uniform input across headbands asks for. Telling the two
 * apart inside that one optics stream is the fNIRS work that was deferred.
 */
export const ATHENA_PRESET = "p1034";

/**
 * Start-up handshake, and the reason an Athena stays silent if you get it
 * wrong. The band will not start on a single preset: it has to be primed on
 * `p21`, started once with `dc001` + `L1`, **halted**, moved to the streaming
 * preset, and started again. That is why `dc001` is sent twice -- once per
 * preset, each time followed by its own `L1` -- and not twice in a row.
 *
 * `v6` and `s` are the version and status queries the official app opens with,
 * `h` halts whatever the band was doing, and `L1` asks for the low-latency
 * connection interval. The firmware drops commands that arrive too close
 * together, hence the wait after each one.
 *
 * Sequence from amused-py's `get_init_sequence`:
 * https://github.com/Amused-EEG/amused-py/blob/main/muse_athena_protocol.py
 */
export const ATHENA_START_SEQUENCE = [
  { command: "v6", waitMs: 200 },
  { command: "s", waitMs: 200 },
  { command: "h", waitMs: 200 },
  { command: ATHENA_PRIMING_PRESET, waitMs: 200 },
  { command: "s", waitMs: 200 },
  { command: "dc001", waitMs: 100 },
  { command: "L1", waitMs: 200 },
  { command: "h", waitMs: 200 },
  { command: ATHENA_PRESET, waitMs: 200 },
  { command: "s", waitMs: 200 },
  { command: "dc001", waitMs: 100 },
  { command: "L1", waitMs: 300 },
] as const;

/** Bytes of packet header before the first subpacket. */
export const PACKET_HEADER_SIZE = 14;
/** A tagged subpacket's own header: the tag, its index, three unread bytes. */
export const SUBPACKET_HEADER_SIZE = 5;
/** The header timestamp counts ticks of a 256 kHz clock. */
export const DEVICE_CLOCK_HZ = 256_000;

/** Sensor kinds we decode; `optics` is recognised only to be skipped. */
export type AthenaSensor = "eeg" | "motion" | "optics" | "battery";

interface TagSpec {
  sensor: AthenaSensor;
  channels: number;
  samples: number;
  /** Payload bytes after the subpacket header. */
  dataLength: number;
}

/**
 * Subpacket tags and their fixed geometry. EEG arrives either as four
 * channels x four samples or, under the optode presets, as eight channels x
 * two samples; both pack into 28 bytes and both start with TP9, AF7, AF8,
 * TP10, so the scalp electrodes are the first four either way.
 */
export const ATHENA_TAGS: Record<number, TagSpec> = {
  0x11: { sensor: "eeg", channels: 4, samples: 4, dataLength: 28 },
  0x12: { sensor: "eeg", channels: 8, samples: 2, dataLength: 28 },
  0x34: { sensor: "optics", channels: 4, samples: 3, dataLength: 30 },
  0x35: { sensor: "optics", channels: 8, samples: 2, dataLength: 40 },
  0x36: { sensor: "optics", channels: 16, samples: 1, dataLength: 40 },
  0x47: { sensor: "motion", channels: 6, samples: 3, dataLength: 36 },
  0x88: { sensor: "battery", channels: 1, samples: 1, dataLength: 188 },
  0x98: { sensor: "battery", channels: 1, samples: 1, dataLength: 20 },
};

/** Motion samples per subpacket; matches the Muse 2's IMU notification. */
export const ATHENA_MOTION_SAMPLES = 3;
/** Accelerometer and gyroscope rate, as on the Muse 2. */
export const ATHENA_MOTION_RATE_HZ = 52;

/**
 * Microvolts per count: 1450 uV full scale over 14 bits. Samples are unsigned
 * around mid-scale, so {@link ATHENA_ADC_ZERO} is subtracted to land on the
 * same zero-centred microvolts the Muse 2 decoder produces.
 */
export const ATHENA_UV_PER_COUNT = 1450 / 16383;
const ATHENA_ADC_ZERO = 0x2000;

/** Same scale factors as the older bands' IMU. */
export const ATHENA_ACCELEROMETER_SCALE = 0.0000610352;
export const ATHENA_GYROSCOPE_SCALE = -0.0074768;

/** One decoded EEG subpacket: the four scalp electrodes, N samples each. */
export interface AthenaEegSubpacket {
  sensor: "eeg";
  /** Device-clock ticks from the packet header this subpacket rode in. */
  tick: number;
  /** Samples per channel (4 in the four-channel mode, 2 in the eight). */
  sampleCount: number;
  /** Microvolts, zero-centred, keyed by electrode. */
  channels: Record<EegChannel, Float32Array>;
}

/** One decoded accelerometer + gyroscope subpacket: three xyz readings each. */
export interface AthenaMotionSubpacket {
  sensor: "motion";
  tick: number;
  /** Flat [x,y,z] triplets in g, three readings. */
  acc: Float32Array;
  /** Flat [x,y,z] triplets in degrees/s, three readings. */
  gyro: Float32Array;
}

/** A battery reading; the Athena has no separate telemetry characteristic. */
export interface AthenaBatterySubpacket {
  sensor: "battery";
  tick: number;
  batteryPercent: number;
}

export type AthenaSubpacket =
  AthenaEegSubpacket | AthenaMotionSubpacket | AthenaBatterySubpacket;

/** Read `width` bits starting at `bitStart`, least significant bit first. */
export function readBitsLsb(
  bytes: Uint8Array,
  bitStart: number,
  width: number
): number {
  let value = 0;
  for (let i = 0; i < width; i++) {
    const bit = bitStart + i;
    if ((bytes[bit >> 3] >> (bit & 7)) & 1) value |= 1 << i;
  }
  return value;
}

/**
 * Decode one notification into the subpackets we keep. Anything unknown ends
 * the walk of that packet rather than throwing: a firmware that adds a stream
 * must not cost us the EEG that arrived in front of it.
 */
export function decodeAthenaMessage(data: DataView): AthenaSubpacket[] {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const out: AthenaSubpacket[] = [];
  let offset = 0;
  while (offset + PACKET_HEADER_SIZE <= bytes.length) {
    const packetLength = bytes[offset];
    if (packetLength < PACKET_HEADER_SIZE) break;
    if (offset + packetLength > bytes.length) break;
    const packet = bytes.subarray(offset, offset + packetLength);
    // Bytes 6..8 and 10..13 of the header carry values nobody has identified.
    // Little-endian uint32; multiplied rather than shifted to stay unsigned.
    const tick =
      packet[2] +
      packet[3] * 0x100 +
      packet[4] * 0x10000 +
      packet[5] * 0x1000000;
    const primaryTag = packet[9];
    readSubpackets(packet.subarray(PACKET_HEADER_SIZE), primaryTag, tick, out);
    offset += packetLength;
  }
  return out;
}

/**
 * Walk one packet's data section. The first subpacket is bare -- its kind is
 * the tag in the packet header and it carries neither tag byte nor subpacket
 * header -- and every later one is prefixed by five bytes.
 */
function readSubpackets(
  section: Uint8Array,
  primaryTag: number,
  tick: number,
  out: AthenaSubpacket[]
): void {
  let offset = 0;
  let tag: number | undefined = primaryTag;
  let headerSize = 0;
  while (offset < section.length) {
    if (tag === undefined) {
      if (offset + SUBPACKET_HEADER_SIZE > section.length) return;
      tag = section[offset];
      headerSize = SUBPACKET_HEADER_SIZE;
    }
    const spec = ATHENA_TAGS[tag];
    if (!spec) return; // unknown tag: the rest of this packet cannot be framed
    const start = offset + headerSize;
    const end = start + spec.dataLength;
    if (end > section.length) return;
    const payload = section.subarray(start, end);
    const decoded = decodeSubpacket(spec, payload, tick);
    if (decoded) out.push(decoded);
    // Battery subpackets are the one variable-length kind, so their declared
    // length cannot be trusted to find whatever follows them.
    if (spec.sensor === "battery") return;
    offset = end;
    tag = undefined;
    headerSize = 0;
  }
}

function decodeSubpacket(
  spec: TagSpec,
  payload: Uint8Array,
  tick: number
): AthenaSubpacket | null {
  switch (spec.sensor) {
    case "eeg":
      return decodeAthenaEeg(payload, spec.channels, tick);
    case "motion":
      return decodeAthenaMotion(payload, tick);
    case "battery":
      // State of charge in the first two bytes, little-endian, 256 per percent.
      return {
        sensor: "battery",
        tick,
        batteryPercent: (payload[0] | (payload[1] << 8)) / 256,
      };
    case "optics":
      return null; // fNIRS and PPG: framed over, never recorded
  }
}

/**
 * Decode a 28-byte EEG subpacket: 14-bit unsigned samples packed LSB-first,
 * channel-major within each sample, converted to zero-centred microvolts.
 * Channels beyond the four scalp electrodes (the amplified aux inputs of the
 * eight-channel modes) are dropped so the stream matches the Muse 2's.
 */
export function decodeAthenaEeg(
  payload: Uint8Array,
  channelCount: number,
  tick: number
): AthenaEegSubpacket {
  const sampleCount = channelCount === 4 ? 4 : 2;
  const channels = Object.fromEntries(
    EEG_CHANNELS.map((c) => [c, new Float32Array(sampleCount)])
  ) as Record<EegChannel, Float32Array>;
  for (let sample = 0; sample < sampleCount; sample++) {
    for (let channel = 0; channel < EEG_CHANNELS.length; channel++) {
      const raw = readBitsLsb(
        payload,
        (sample * channelCount + channel) * 14,
        14
      );
      channels[EEG_CHANNELS[channel]][sample] =
        ATHENA_UV_PER_COUNT * (raw - ATHENA_ADC_ZERO);
    }
  }
  return { sensor: "eeg", tick, sampleCount, channels };
}

/** Decode a 36-byte motion subpacket: three interleaved acc+gyro readings. */
export function decodeAthenaMotion(
  payload: Uint8Array,
  tick: number
): AthenaMotionSubpacket {
  const acc = new Float32Array(9);
  const gyro = new Float32Array(9);
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  for (let i = 0; i < ATHENA_MOTION_SAMPLES; i++) {
    const base = i * 12;
    for (let axis = 0; axis < 3; axis++) {
      acc[i * 3 + axis] =
        ATHENA_ACCELEROMETER_SCALE * view.getInt16(base + axis * 2, true);
      gyro[i * 3 + axis] =
        ATHENA_GYROSCOPE_SCALE * view.getInt16(base + 6 + axis * 2, true);
    }
  }
  return { sensor: "motion", tick, acc, gyro };
}

const CLOCK_MODULO = 2 ** 32;

/**
 * A hole this long is not a hole. Above it the tick has to be assumed bad --
 * a firmware that moved the field, a reset mid-session -- and the clock is
 * rebased instead of minting a gap of millions of samples that would make an
 * otherwise sound recording read as almost entirely lost. Five seconds is far
 * past any real dropout that still leaves a link standing.
 */
const MAX_CREDIBLE_GAP_SECONDS = 5;

/**
 * Turns the header's 256 kHz tick into a sample index on one stream's own
 * clock, which is what the rest of the app records against.
 *
 * The clock is a 32-bit counter, so it wraps; packets that share a tick or
 * arrive slightly out of order are common, so the index is also forced
 * forward. Lost notifications leave a hole in the ticks and so become a jump
 * in the index, which is exactly how a lost Muse 2 packet reads.
 *
 * Ported from OpenMuse's global timestamping (MIT).
 */
export class AthenaClock {
  private baseTick: number | null = null;
  private lastAbsoluteTick = 0;
  private wrapOffset = 0;
  private nextIndex = 0;

  constructor(private readonly rateHz: number = SAMPLE_RATE_HZ) {}

  /** Index of the first of `count` samples timed by `rawTick`. */
  next(rawTick: number, count: number): number {
    if (this.baseTick === null) {
      this.baseTick = rawTick;
      this.lastAbsoluteTick = rawTick;
    }
    const previousRaw = this.lastAbsoluteTick % CLOCK_MODULO;
    let absolute: number;
    if (rawTick < previousRaw) {
      absolute =
        previousRaw - rawTick > CLOCK_MODULO / 2
          ? rawTick + (this.wrapOffset += CLOCK_MODULO) // the counter wrapped
          : this.lastAbsoluteTick; // a small inversion: hold the clock still
    } else {
      absolute = Math.max(rawTick + this.wrapOffset, this.lastAbsoluteTick);
    }
    this.lastAbsoluteTick = absolute;
    let index = Math.max(
      Math.round(((absolute - this.baseTick) / DEVICE_CLOCK_HZ) * this.rateHz),
      this.nextIndex
    );
    if (index - this.nextIndex > this.rateHz * MAX_CREDIBLE_GAP_SECONDS) {
      // Rebase onto this tick and carry on where the samples left off.
      this.baseTick =
        absolute - (this.nextIndex / this.rateHz) * DEVICE_CLOCK_HZ;
      index = this.nextIndex;
    }
    this.nextIndex = index + count;
    return index;
  }
}
