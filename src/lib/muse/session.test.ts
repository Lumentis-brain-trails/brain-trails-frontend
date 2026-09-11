import { describe, expect, test } from "vitest";
import { EEG_CHANNELS } from "./protocol";
import { buildSessionCsv, SessionRecorder } from "./session";

const packet = (v: number) => Float32Array.from({ length: 12 }, () => v);

describe("SessionRecorder", () => {
  test("matches the four electrodes by counter, whatever the arrival order", () => {
    const r = new SessionRecorder();
    r.feed("AF7", 100, packet(2));
    r.feed("TP9", 100, packet(1));
    r.feed("AF8", 100, packet(3));
    r.feed("TP10", 100, packet(4));
    r.feed("TP9", 101, packet(1));
    r.feed("AF7", 101, packet(2));
    r.feed("AF8", 101, packet(3));
    r.feed("TP10", 101, packet(4));
    const c = r.stop();
    expect(c.blocks).toHaveLength(2);
    expect(c.blocks[0].sampleIndex).toBe(1200);
    expect(c.firstSampleIndex).toBe(1200);
    expect(c.lastSampleIndex).toBe(1223);
    expect(c.missingSamples).toBe(0);
    expect(c.durationS).toBeCloseTo(24 / 256);
  });

  test("counts lost packets as missing samples and keeps partial blocks", () => {
    const r = new SessionRecorder();
    for (const ch of EEG_CHANNELS) r.feed(ch, 65535, packet(1));
    for (const ch of EEG_CHANNELS) r.feed(ch, 1, packet(1)); // packet 0 lost, counter wrapped
    r.feed("TP9", 2, packet(1)); // other electrodes never arrive for packet 2
    const c = r.stop();
    expect(c.blocks.map((b) => b.sampleIndex)).toEqual([
      65535 * 12,
      65537 * 12,
      65538 * 12,
    ]);
    expect(c.missingSamples).toBe(12);
    expect(c.blocks[2].channels.AF7).toBeUndefined();
  });

  test("seconds grows with the device clock", () => {
    const r = new SessionRecorder();
    for (let i = 0; i < 64; i++)
      for (const ch of EEG_CHANNELS) r.feed(ch, i, packet(0));
    expect(r.seconds).toBeCloseTo(3);
  });
});

describe("buildSessionCsv", () => {
  test("writes the header line, the columns and one row per sample", () => {
    const r = new SessionRecorder();
    for (const ch of EEG_CHANNELS)
      r.feed(ch, 10, packet(EEG_CHANNELS.indexOf(ch)));
    r.feed("TP9", 11, packet(9));
    const csv = buildSessionCsv(r.stop(), {
      deviceName: "Muse 1A2B",
      timeline: {
        packets: 2,
        lostPackets: 0,
        lastSampleIndex: 132,
        msPerSample: 3.90625,
        effectiveRateHz: 256,
        driftPpm: 0,
        jitterRmsMs: 1.234,
      },
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toMatch(
      /^# brain-trails-session v1 sfreq=256 device=Muse_1A2B /
    );
    expect(lines[0]).toContain("jitter_rms_ms=1.23");
    expect(lines[0]).toContain("missing_samples=0");
    expect(lines[1]).toBe("sample_index,t_session_s,TP9,AF7,AF8,TP10");
    expect(lines[2]).toBe("120,0.000000,0.00,1.00,2.00,3.00");
    expect(lines[13]).toBe("131,0.042969,0.00,1.00,2.00,3.00");
    expect(lines[14]).toBe("132,0.046875,9.00,,,"); // partial block: empty cells
    expect(lines).toHaveLength(2 + 24);
  });

  test("writes 'na' for timing stats that do not exist yet", () => {
    const r = new SessionRecorder();
    const csv = buildSessionCsv(r.stop(), {
      deviceName: "Muse-SIM",
      timeline: null,
    });
    expect(csv.split("\n")[0]).toContain("jitter_rms_ms=na");
  });
});
