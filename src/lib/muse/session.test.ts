import { describe, expect, test } from "vitest";
import { EEG_CHANNELS } from "./protocol";
import {
  buildExtrasCsv,
  buildSessionCsv,
  ExtrasRecorder,
  SessionRecorder,
} from "./session";

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
        hostMsAtIndex0: 0,
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

describe("ExtrasRecorder + buildExtrasCsv", () => {
  test("keeps per-stream counters and writes samples on the EEG clock", () => {
    const eeg = new SessionRecorder();
    for (const ch of EEG_CHANNELS) eeg.feed(ch, 100, packet(0));
    const capture = eeg.stop(); // firstSampleIndex = 1200
    const x = new ExtrasRecorder();
    x.feed("acc", 65535, Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), 1000);
    x.feed("acc", 0, Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), 1057.7);
    x.feed("ppg_infrared", 7, Float32Array.from([1, 2, 3, 4, 5, 6]), 1000);
    expect(x.counts()).toEqual({ acc: 2, ppg_infrared: 1 });
    // EEG fit: host 1000 ms is sample index 1200 exactly, 256 Hz.
    const csv = buildExtrasCsv(x.stop(), capture, {
      packets: 1,
      lostPackets: 0,
      lastSampleIndex: 1200,
      msPerSample: 1000 / 256,
      hostMsAtIndex0: 1000 - 1200 * (1000 / 256),
      effectiveRateHz: 256,
      driftPpm: 0,
      jitterRmsMs: 0,
    });
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("stream,sample_index,t_session_s,v0,v1,v2");
    // acc packet 65535: three samples, the last one at t=0, earlier ones 1/52 s apart
    expect(lines[2]).toBe(
      `acc,${65535 * 3},${(-2 / 52).toFixed(6)},0.0000,0.0000,1.0000`
    );
    expect(lines[4]).toBe(`acc,${65535 * 3 + 2},0.000000,0.0000,0.0000,1.0000`);
    // wrapped counter continues at 65536
    expect(lines[5].startsWith(`acc,${65536 * 3},`)).toBe(true);
    // ppg: one value per row, last sample at t=0
    expect(lines[13]).toBe("ppg_infrared,47,0.000000,6,,");
  });

  test("writes 'na' times when the EEG clock fit is missing", () => {
    const x = new ExtrasRecorder();
    x.feed("gyro", 1, new Float32Array(9), 5);
    const csv = buildExtrasCsv(x.stop(), new SessionRecorder().stop(), null);
    expect(csv.split("\n")[2]).toMatch(/^gyro,3,na,/);
  });
});
