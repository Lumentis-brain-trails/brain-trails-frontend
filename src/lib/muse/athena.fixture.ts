/**
 * Builders for synthetic Muse S Athena notifications.
 *
 * The Athena's wire format is a chain of packets of tagged subpackets, so the
 * decoder can only be tested against bytes laid out exactly as the firmware
 * lays them out. These builders are the encoder side of `athena.ts`, kept in
 * their own module because both the protocol tests and the driver tests need
 * them.
 */

/** Pack 14-bit values the way the firmware does: LSB-first, no padding. */
export function pack14(values: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil((values.length * 14) / 8));
  values.forEach((value, index) => {
    for (let b = 0; b < 14; b++) {
      if ((value >> b) & 1) {
        const bit = index * 14 + b;
        out[bit >> 3] |= 1 << (bit & 7);
      }
    }
  });
  return out;
}

/** 28 bytes of EEG: `samples` x `channels` counts, sample-major. */
export function eegPayload(rows: number[][]): Uint8Array {
  const payload = new Uint8Array(28);
  payload.set(pack14(rows.flat()).subarray(0, 28));
  return payload;
}

/** 36 bytes of motion: three readings of [ax,ay,az,gx,gy,gz], int16 LE. */
export function motionPayload(readings: number[][]): Uint8Array {
  const payload = new Uint8Array(36);
  const view = new DataView(payload.buffer);
  readings.forEach((reading, i) =>
    reading.forEach((v, axis) => view.setInt16(i * 12 + axis * 2, v, true))
  );
  return payload;
}

interface PacketSpec {
  tick: number;
  primaryTag: number;
  primaryData: Uint8Array;
  extras?: { tag: number; data: Uint8Array }[];
}

/** One Athena packet: 14-byte header, bare primary subpacket, tagged rest. */
export function athenaPacket(spec: PacketSpec): Uint8Array {
  const extras = spec.extras ?? [];
  const length =
    14 +
    spec.primaryData.length +
    extras.reduce((n, e) => n + 5 + e.data.length, 0);
  const packet = new Uint8Array(length);
  packet[0] = length;
  packet[1] = 7; // packet index; unread by the decoder
  new DataView(packet.buffer).setUint32(2, spec.tick, true);
  packet[9] = spec.primaryTag;
  let offset = 14;
  packet.set(spec.primaryData, offset);
  offset += spec.primaryData.length;
  for (const extra of extras) {
    packet[offset] = extra.tag;
    packet[offset + 1] = 3; // subpacket index; unread by the decoder
    packet.set(extra.data, offset + 5);
    offset += 5 + extra.data.length;
  }
  return packet;
}

/** Concatenate packets into one notification, as the band does. */
export function athenaMessage(...packets: Uint8Array[]): DataView {
  const total = packets.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of packets) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return new DataView(bytes.buffer);
}
