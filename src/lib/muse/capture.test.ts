// @vitest-environment node
// Streams, Blob and CompressionStream as the browser has them; jsdom's Blob has no stream().
import { describe, expect, test } from "vitest";
import {
  buildCaptureBlob,
  CAPTURE_MAGIC,
  CapturePreamble,
  encodeCapture,
  RawCapture,
  type CaptureMeta,
} from "./capture";
import type { RawEvent } from "./device";
import { CONTROL_CHARACTERISTIC } from "./protocol";

const DATA = "273e0013-4c4d-454d-96be-f03bac821358";

const meta: CaptureMeta = {
  model: "athena",
  deviceName: "MuseS-4B1C",
  startedAt: "2026-09-19T10:00:00.000Z",
  timeline: {
    hostMsAtIndex0: 1000.5,
    msPerSample: 3.90625,
    firstSampleIndex: 256,
  },
  userAgent: "test",
};

const event = (
  characteristic: string,
  bytes: number[],
  hostMs: number,
  direction: RawEvent["direction"] = "in"
): RawEvent => ({
  characteristic,
  direction,
  bytes: new Uint8Array(bytes),
  hostMs,
});

/**
 * Read a capture back, the way `pipeline/sources/ble_capture.py` does, so the
 * two ends of the format are held to the same layout.
 */
function decode(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, 7));
  const headerLength = view.getUint32(7, true);
  const header = JSON.parse(
    new TextDecoder().decode(bytes.subarray(11, 11 + headerLength))
  );
  const records = [];
  let offset = 11 + headerLength;
  while (offset < bytes.length) {
    const length = view.getUint16(offset + 10, true);
    records.push({
      hostMs: view.getFloat64(offset, true),
      characteristic: header.channels[view.getUint8(offset + 8)],
      direction: view.getUint8(offset + 9) === 0 ? "in" : "out",
      bytes: Array.from(bytes.subarray(offset + 12, offset + 12 + length)),
    });
    offset += 12 + length;
  }
  return { magic, header, records };
}

describe("encodeCapture", () => {
  test("frames records behind a JSON header that names each characteristic once", () => {
    const records = [
      event(CONTROL_CHARACTERISTIC, [3, 88, 104, 10], 1.25, "out"),
      event(DATA, [0xde, 0xad], 2.5),
      event(CONTROL_CHARACTERISTIC, [2, 123, 125], 3),
      event(DATA, [], 4.75),
    ];
    const decoded = decode(encodeCapture(records, meta));
    expect(decoded.magic).toBe(CAPTURE_MAGIC);
    expect(decoded.header).toMatchObject({
      format: "brain-trails-ble",
      version: 1,
      model: "athena",
      device_name: "MuseS-4B1C",
      started_at: meta.startedAt,
      user_agent: "test",
      timeline: {
        host_ms_at_index0: 1000.5,
        ms_per_sample: 3.90625,
        first_sample_index: 256,
      },
      channels: [CONTROL_CHARACTERISTIC, DATA],
    });
    expect(decoded.records).toEqual(
      records.map((r) => ({ ...r, bytes: Array.from(r.bytes) }))
    );
  });

  test("refuses what the record layout cannot hold", () => {
    expect(() =>
      encodeCapture([event(DATA, new Array(0x10000).fill(0), 0)], meta)
    ).toThrow(/cannot be framed/);
    const many = Array.from({ length: 257 }, (_, i) =>
      event(`uuid-${i}`, [i & 0xff], i)
    );
    expect(() => encodeCapture(many, meta)).toThrow(/256 characteristics/);
  });
});

describe("buildCaptureBlob", () => {
  test("gzips the framed capture; nothing raw means no file", async () => {
    expect(await buildCaptureBlob([], meta)).toBeNull();
    const records = [event(DATA, [1, 2, 3], 5)];
    const blob = (await buildCaptureBlob(records, meta))!;
    expect(blob.type).toBe("application/gzip");
    const unzipped = new Uint8Array(
      await new Response(
        new Response(blob).body!.pipeThrough(new DecompressionStream("gzip"))
      ).arrayBuffer()
    );
    expect(unzipped).toEqual(encodeCapture(records, meta));
  });
});

describe("RawCapture and CapturePreamble", () => {
  test("a capture starts from the handshake and counts what it holds", () => {
    const preamble = new CapturePreamble(CONTROL_CHARACTERISTIC);
    preamble.offer(event(CONTROL_CHARACTERISTIC, [1, 2], 1, "out"));
    preamble.offer(event(DATA, [9, 9, 9], 2)); // streaming before Record: not kept
    preamble.offer(event(CONTROL_CHARACTERISTIC, [3], 3));
    const capture = new RawCapture(preamble.snapshot());
    capture.feed(event(DATA, [4, 5, 6, 7], 4));
    expect(capture.count).toBe(3);
    expect(capture.payloadBytes).toBe(7);
    expect(capture.stop().map((r) => r.hostMs)).toEqual([1, 3, 4]);
  });

  test("the preamble stops growing at its cap", () => {
    const preamble = new CapturePreamble(CONTROL_CHARACTERISTIC);
    for (let i = 0; i < 600; i++)
      preamble.offer(event(CONTROL_CHARACTERISTIC, [i & 0xff], i));
    expect(preamble.snapshot()).toHaveLength(500);
  });
});
