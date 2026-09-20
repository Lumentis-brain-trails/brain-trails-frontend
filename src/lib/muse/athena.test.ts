import { describe, expect, test } from "vitest";
import {
  AthenaClock,
  ATHENA_MOTION_RATE_HZ,
  ATHENA_UV_PER_COUNT,
  DEVICE_CLOCK_HZ,
  decodeAthenaMessage,
  readBitsLsb,
  type AthenaEegSubpacket,
  type AthenaMotionSubpacket,
} from "./athena";
import {
  athenaMessage,
  athenaPacket,
  eegPayload,
  motionPayload,
} from "./athena.fixture";
import { SAMPLE_RATE_HZ } from "./protocol";

const eegRows = (base: number) => [
  [base + 100, base + 200, base + 300, base + 400],
  [base - 100, base - 200, base - 300, base - 400],
  [base, base, base, base],
  [base + 1, base + 2, base + 3, base + 4],
];

describe("readBitsLsb", () => {
  test("reads a value that straddles two bytes, least significant bit first", () => {
    // Bits, least significant first: 0,1,0,1,0,1,0,1 then 1,1,0,0,0,0,0,0.
    // Bits 6..9 are 0,1,1,1, which read back as 0b1110.
    const bytes = Uint8Array.from([0b10101010, 0b00000011]);
    expect(readBitsLsb(bytes, 0, 8)).toBe(0b10101010);
    expect(readBitsLsb(bytes, 6, 4)).toBe(0b1110);
  });
});

describe("decodeAthenaMessage", () => {
  test("decodes a four-channel EEG subpacket into zero-centred microvolts", () => {
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({
          tick: 0,
          primaryTag: 0x11,
          primaryData: eegPayload(eegRows(0x2000)),
        })
      )
    );
    expect(parts).toHaveLength(1);
    const eeg = parts[0] as AthenaEegSubpacket;
    expect(eeg.sensor).toBe("eeg");
    expect(eeg.sampleCount).toBe(4);
    expect(eeg.channels.TP9[0]).toBeCloseTo(100 * ATHENA_UV_PER_COUNT, 4);
    expect(eeg.channels.TP10[0]).toBeCloseTo(400 * ATHENA_UV_PER_COUNT, 4);
    expect(eeg.channels.AF7[1]).toBeCloseTo(-200 * ATHENA_UV_PER_COUNT, 4);
    expect(eeg.channels.AF8[2]).toBeCloseTo(0, 6); // mid-scale reads as zero
    expect(eeg.channels.TP9).toHaveLength(4);
  });

  test("keeps the four scalp electrodes of an eight-channel subpacket", () => {
    // Under the optode presets the band sends two samples of eight channels;
    // TP9, AF7, AF8 and TP10 are the first four, the aux inputs follow.
    const rows = [
      [0x2000 + 10, 0x2000 + 20, 0x2000 + 30, 0x2000 + 40, 1, 2, 3, 4],
      [0x2000 + 50, 0x2000 + 60, 0x2000 + 70, 0x2000 + 80, 5, 6, 7, 8],
    ];
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({
          tick: 0,
          primaryTag: 0x12,
          primaryData: eegPayload(rows),
        })
      )
    );
    const eeg = parts[0] as AthenaEegSubpacket;
    expect(eeg.sampleCount).toBe(2);
    expect(eeg.channels.TP9[0]).toBeCloseTo(10 * ATHENA_UV_PER_COUNT, 4);
    expect(eeg.channels.TP10[1]).toBeCloseTo(80 * ATHENA_UV_PER_COUNT, 4);
  });

  test("decodes motion into g and degrees per second", () => {
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({
          tick: 0,
          primaryTag: 0x47,
          primaryData: motionPayload([
            [0, 0, 16384, 100, 0, 0],
            [0, 0, 16384, 0, 0, 0],
            [0, 0, 16384, 0, 0, 0],
          ]),
        })
      )
    );
    const motion = parts[0] as AthenaMotionSubpacket;
    expect(motion.sensor).toBe("motion");
    expect(motion.acc[2]).toBeCloseTo(1, 2); // gravity on z
    expect(motion.acc).toHaveLength(9);
    expect(motion.gyro[0]).toBeCloseTo(-0.74768, 3); // the gyro scale is negative
  });

  test("reports the state of charge from a battery subpacket", () => {
    const battery = new Uint8Array(188);
    new DataView(battery.buffer).setUint16(0, 76 * 256, true);
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({ tick: 0, primaryTag: 0x88, primaryData: battery })
      )
    );
    expect(parts).toEqual([{ sensor: "battery", tick: 0, batteryPercent: 76 }]);
  });

  test("walks over the optics stream without recording any of it", () => {
    // fNIRS and PPG share this stream; the preset keeps it off, but a packet
    // that carries one must still yield the EEG sitting behind it.
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({
          tick: 12,
          primaryTag: 0x34,
          primaryData: new Uint8Array(30).fill(0xff),
          extras: [{ tag: 0x11, data: eegPayload(eegRows(0x2000)) }],
        })
      )
    );
    expect(parts.map((p) => p.sensor)).toEqual(["eeg"]);
    expect((parts[0] as AthenaEegSubpacket).tick).toBe(12);
  });

  test("reads several subpackets and several packets from one notification", () => {
    const parts = decodeAthenaMessage(
      athenaMessage(
        athenaPacket({
          tick: 1000,
          primaryTag: 0x11,
          primaryData: eegPayload(eegRows(0x2000)),
          extras: [
            {
              tag: 0x47,
              data: motionPayload([
                [0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 0],
              ]),
            },
          ],
        }),
        athenaPacket({
          tick: 2000,
          primaryTag: 0x11,
          primaryData: eegPayload(eegRows(0x2000)),
        })
      )
    );
    expect(parts.map((p) => p.sensor)).toEqual(["eeg", "motion", "eeg"]);
    expect(parts[2].tick).toBe(2000);
  });

  test("keeps what it has already read when a packet turns unreadable", () => {
    const good = athenaPacket({
      tick: 5,
      primaryTag: 0x11,
      primaryData: eegPayload(eegRows(0x2000)),
    });
    const unknownTag = athenaPacket({
      tick: 6,
      primaryTag: 0x11,
      primaryData: eegPayload(eegRows(0x2000)),
      extras: [{ tag: 0x7f, data: new Uint8Array(8) }],
    });
    const truncated = good.subarray(0, 20);
    const parts = decodeAthenaMessage(
      athenaMessage(good, unknownTag, truncated)
    );
    expect(parts).toHaveLength(2); // the two EEG subpackets, nothing invented
    expect(parts.every((p) => p.sensor === "eeg")).toBe(true);
  });

  test("ignores a packet whose declared length is impossible", () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 3; // shorter than a header
    expect(decodeAthenaMessage(new DataView(bytes.buffer))).toEqual([]);
  });
});

describe("AthenaClock", () => {
  /** Ticks of the 256 kHz device clock per EEG sample. */
  const perSample = DEVICE_CLOCK_HZ / SAMPLE_RATE_HZ;

  test("counts samples from the device clock, starting at zero", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    expect(clock.next(100_000, 4)).toBe(0);
    expect(clock.next(100_000 + 4 * perSample, 4)).toBe(4);
    expect(clock.next(100_000 + 8 * perSample, 4)).toBe(8);
  });

  test("a hole in the clock becomes a hole in the indices", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    clock.next(0, 4);
    // Three notifications' worth of ticks pass with nothing delivered.
    expect(clock.next(16 * perSample, 4)).toBe(16);
  });

  test("packets sharing a tick are laid end to end, never on top", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    expect(clock.next(0, 4)).toBe(0);
    expect(clock.next(0, 4)).toBe(4);
    expect(clock.next(0, 4)).toBe(8);
  });

  test("a small backwards jump holds the clock instead of rewinding", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    clock.next(10 * perSample, 4);
    const index = clock.next(9 * perSample, 4); // arrived out of order
    expect(index).toBe(4);
  });

  test("follows the 32-bit clock across its wrap", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    const start = 2 ** 32 - 4 * perSample;
    expect(clock.next(start, 4)).toBe(0);
    expect(clock.next(0, 4)).toBe(4); // wrapped, not rewound
  });

  test("an implausible tick rebases the clock instead of minting a huge gap", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    clock.next(0, 4);
    // A jump of an hour of ticks cannot be a dropout on a live link; taken at
    // face value it would report a million samples lost and make a sound
    // recording read as empty.
    const index = clock.next(3600 * DEVICE_CLOCK_HZ, 4);
    expect(index).toBe(4);
    // And the clock keeps running from there, still on the device's rate.
    expect(clock.next(3601 * DEVICE_CLOCK_HZ, 4)).toBe(4 + SAMPLE_RATE_HZ);
  });

  test("a real dropout under the limit is still reported as a gap", () => {
    const clock = new AthenaClock(SAMPLE_RATE_HZ);
    clock.next(0, 4);
    expect(clock.next(2 * DEVICE_CLOCK_HZ, 4)).toBe(2 * SAMPLE_RATE_HZ);
  });

  test("times motion against its own 52 Hz rate", () => {
    const clock = new AthenaClock(ATHENA_MOTION_RATE_HZ);
    clock.next(0, 3);
    expect(clock.next(DEVICE_CLOCK_HZ, 3)).toBe(ATHENA_MOTION_RATE_HZ);
  });
});
