/**
 * The raw Bluetooth capture of a session (backend decision V2-0006).
 *
 * The session CSV and the extras file keep what today's decoders understand;
 * this keeps what the headband actually sent. Every notification and every
 * command, byte for byte, stamped with the same `performance.now()` clock the
 * EEG timeline fit is expressed in, so a decoder written later -- the Athena's
 * PPG and fNIRS, heart rate, breathing -- can be run over sessions recorded
 * before it existed.
 *
 * The file is framed as below and gzip-compressed; the backend reader is
 * `pipeline/sources/ble_capture.py` and the two must change together.
 *
 *     "BTBLE1\n"                          magic, 7 ASCII bytes
 *     u32 LE  header length, then that many bytes of UTF-8 JSON
 *     records until EOF, each:
 *       f64 LE  hostMs
 *       u8      index of the characteristic in header.channels
 *       u8      0 = notification from the band, 1 = command written to it
 *       u16 LE  payload length, then the payload
 */
import type { RawEvent } from "./device";
import type { MuseModel } from "./models";

export const CAPTURE_MAGIC = "BTBLE1\n";
export const CAPTURE_VERSION = 1;
const RECORD_HEAD_BYTES = 12;

/**
 * Handshake records kept from before Record is pressed. Control traffic is a
 * few dozen exchanges; the cap only guards against a band that chatters.
 */
const PREAMBLE_LIMIT = 500;

/** What the header says beyond the characteristic list, which is derived. */
export interface CaptureMeta {
  model: MuseModel;
  deviceName: string;
  /** Wall-clock start of the recording, ISO 8601. */
  startedAt: string;
  /**
   * The EEG timeline fit (V1-0001) at stop: maps a record's `hostMs` onto the
   * EEG sample index, which the session CSV counts from `firstSampleIndex`.
   */
  timeline: {
    hostMsAtIndex0: number | null;
    msPerSample: number | null;
    firstSampleIndex: number;
  };
  userAgent?: string;
}

/**
 * Collects the raw events of one session. Created at Record with the control
 * traffic seen since connection (the firmware's replies to the handshake),
 * then fed every event until Stop.
 */
export class RawCapture {
  private records: RawEvent[];
  private bytes = 0;

  constructor(preamble: RawEvent[] = []) {
    this.records = [...preamble];
    for (const r of preamble) this.bytes += r.bytes.length;
  }

  feed(event: RawEvent): void {
    this.records.push(event);
    this.bytes += event.bytes.length;
  }

  /** Records held so far. */
  get count(): number {
    return this.records.length;
  }

  /** Payload bytes held so far, before framing and compression. */
  get payloadBytes(): number {
    return this.bytes;
  }

  stop(): RawEvent[] {
    return this.records;
  }
}

/**
 * Keeps the control characteristic's traffic from connection on, so a capture
 * started minutes later still carries the handshake. Everything else before
 * Record is streaming nobody asked to keep.
 */
export class CapturePreamble {
  private records: RawEvent[] = [];

  constructor(private readonly controlUuid: string) {}

  offer(event: RawEvent): void {
    if (event.characteristic !== this.controlUuid) return;
    if (this.records.length < PREAMBLE_LIMIT) this.records.push(event);
  }

  snapshot(): RawEvent[] {
    return [...this.records];
  }
}

/** Frame the records as the uncompressed capture described above. */
export function encodeCapture(
  records: RawEvent[],
  meta: CaptureMeta
): Uint8Array<ArrayBuffer> {
  const channels: string[] = [];
  const index = new Map<string, number>();
  for (const r of records) {
    if (index.has(r.characteristic)) continue;
    if (channels.length === 256)
      throw new Error("a capture cannot name more than 256 characteristics");
    index.set(r.characteristic, channels.length);
    channels.push(r.characteristic);
  }
  const header = new TextEncoder().encode(
    JSON.stringify({
      format: "brain-trails-ble",
      version: CAPTURE_VERSION,
      model: meta.model,
      device_name: meta.deviceName,
      started_at: meta.startedAt,
      user_agent: meta.userAgent ?? null,
      timeline: {
        host_ms_at_index0: meta.timeline.hostMsAtIndex0,
        ms_per_sample: meta.timeline.msPerSample,
        first_sample_index: meta.timeline.firstSampleIndex,
      },
      channels,
    })
  );
  const magic = new TextEncoder().encode(CAPTURE_MAGIC);
  let size = magic.length + 4 + header.length;
  for (const r of records) size += RECORD_HEAD_BYTES + r.bytes.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(magic, 0);
  let offset = magic.length;
  view.setUint32(offset, header.length, true);
  offset += 4;
  out.set(header, offset);
  offset += header.length;
  for (const r of records) {
    if (r.bytes.length > 0xffff)
      throw new Error(
        `a BLE payload of ${r.bytes.length} bytes cannot be framed`
      );
    view.setFloat64(offset, r.hostMs, true);
    view.setUint8(offset + 8, index.get(r.characteristic)!);
    view.setUint8(offset + 9, r.direction === "in" ? 0 : 1);
    view.setUint16(offset + 10, r.bytes.length, true);
    out.set(r.bytes, offset + RECORD_HEAD_BYTES);
    offset += RECORD_HEAD_BYTES + r.bytes.length;
  }
  return out;
}

/** Gzip in the browser's own compressor (Chrome/Edge, where Web Bluetooth is). */
export async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Blob> {
  const stream = new Response(bytes).body!.pipeThrough(
    new CompressionStream("gzip")
  );
  return new Response(stream).blob();
}

/** The capture file ready to upload, or null when there is nothing raw to keep. */
export async function buildCaptureBlob(
  records: RawEvent[],
  meta: CaptureMeta
): Promise<Blob | null> {
  if (records.length === 0) return null;
  const blob = await gzip(encodeCapture(records, meta));
  return new Blob([blob], { type: "application/gzip" });
}
