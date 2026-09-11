import { describe, expect, test } from "vitest";
import {
  ACCELEROMETER_SCALE,
  decodeImuPacket,
  decodePpgPacket,
  decodeEegPacket,
  decodeResponse,
  decodeTelemetry,
  encodeCommand,
  unpack12Bit,
  UV_PER_COUNT,
} from "./protocol";

/** Pack twelve 12-bit values the way the firmware does (two per three bytes). */
function pack12Bit(values: number[]): Uint8Array {
  const out = new Uint8Array(18);
  let o = 0;
  for (let i = 0; i < values.length; i += 2) {
    const a = values[i];
    const b = values[i + 1];
    out[o++] = a >> 4;
    out[o++] = ((a & 0x0f) << 4) | (b >> 8);
    out[o++] = b & 0xff;
  }
  return out;
}

function eegPacket(counter: number, values: number[]): DataView {
  const buf = new Uint8Array(20);
  buf[0] = counter >> 8;
  buf[1] = counter & 0xff;
  buf.set(pack12Bit(values), 2);
  return new DataView(buf.buffer);
}

describe("muse protocol", () => {
  test("encodeCommand frames length, text and newline", () => {
    expect(Array.from(encodeCommand("h"))).toEqual([2, 0x68, 0x0a]);
    const p21 = encodeCommand("p21");
    expect(p21[0]).toBe(4);
    expect(new TextDecoder().decode(p21.subarray(1))).toBe("p21\n");
  });

  test("decodeResponse reads only the declared length", () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 3;
    bytes.set(new TextEncoder().encode("abcXXXX"), 1);
    expect(decodeResponse(new DataView(bytes.buffer))).toBe("abc");
  });

  test("unpack12Bit round-trips packed values", () => {
    const values = [0, 4095, 2048, 1, 2047, 2049, 100, 200, 300, 400, 500, 600];
    expect(unpack12Bit(pack12Bit(values))).toEqual(values);
  });

  test("decodeEegPacket converts to microvolts around mid-scale", () => {
    const values = [
      2048,
      2048 + 100,
      2048 - 100,
      0,
      4095,
      2048,
      2048,
      2048,
      2048,
      2048,
      2048,
      2048,
    ];
    const packet = decodeEegPacket(eegPacket(0x1234, values));
    expect(packet.counter).toBe(0x1234);
    expect(packet.samples).toHaveLength(12);
    expect(packet.samples[0]).toBeCloseTo(0);
    expect(packet.samples[1]).toBeCloseTo(100 * UV_PER_COUNT);
    expect(packet.samples[2]).toBeCloseTo(-100 * UV_PER_COUNT);
    expect(packet.samples[3]).toBeCloseTo(-2048 * UV_PER_COUNT);
    expect(packet.samples[4]).toBeCloseTo(2047 * UV_PER_COUNT);
  });

  test("decodeEegPacket rejects wrong lengths", () => {
    expect(() => decodeEegPacket(new DataView(new ArrayBuffer(19)))).toThrow(
      /20 bytes/
    );
  });

  test("decodeTelemetry applies the documented scale factors", () => {
    const buf = new DataView(new ArrayBuffer(20));
    buf.setUint16(0, 7);
    buf.setUint16(2, 512 * 78);
    buf.setUint16(4, 1000);
    buf.setUint16(8, 31);
    const t = decodeTelemetry(buf);
    expect(t).toEqual({
      sequence: 7,
      batteryPercent: 78,
      voltageMv: 2200,
      temperatureC: 31,
    });
  });

  test("decodeImuPacket reads three scaled xyz readings", () => {
    const buf = new DataView(new ArrayBuffer(20));
    buf.setUint16(0, 9);
    buf.setInt16(2, 16384); // x0 = 1 g at the accelerometer scale
    buf.setInt16(4, -16384);
    buf.setInt16(6, 0);
    buf.setInt16(14, 8192); // x2 = 0.5 g
    const p = decodeImuPacket(buf, ACCELEROMETER_SCALE);
    expect(p.counter).toBe(9);
    expect(p.samples).toHaveLength(9);
    expect(p.samples[0]).toBeCloseTo(1, 2);
    expect(p.samples[1]).toBeCloseTo(-1, 2);
    expect(p.samples[6]).toBeCloseTo(0.5, 2);
  });

  test("decodePpgPacket reads six unsigned 24-bit values", () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 0;
    bytes[1] = 3;
    bytes.set([0x01, 0x02, 0x03], 2); // 66051
    bytes.set([0xff, 0xff, 0xff], 17); // 16777215
    const p = decodePpgPacket(new DataView(bytes.buffer));
    expect(p.counter).toBe(3);
    expect(p.samples[0]).toBe(66051);
    expect(p.samples[5]).toBe(16777215);
  });
});
