import { describe, expect, test } from "vitest";
import { EEG_CHANNELS } from "./protocol";
import {
  buildExtrasCsv,
  buildSessionCsv,
  ExtrasRecorder,
  SessionRecorder,
} from "./session";

const packet = (v: number, length = 12) =>
  Float32Array.from({ length }, () => v);

describe("SessionRecorder", () => {
  /**
   * Page events are placed on the session clock while the run is happening, so the
   * capture's origin has to be readable before `stop()` - and honestly absent before the
   * first packet, rather than defaulting to zero.
   */
  test("exposes its first sample index live, and none before the first packet", () => {
    const r = new SessionRecorder();
    expect(r.firstIndex).toBeNull();

    r.feed("TP9", 1200, packet(1));
    expect(r.firstIndex).toBe(1200);

    r.feed("AF7", 1200, packet(2));
    r.feed("TP9", 1212, packet(1));
    // Still the first index seen, not the latest.
    expect(r.firstIndex).toBe(1200);
    expect(r.stop().firstSampleIndex).toBe(1200);
  });

  test("matches the four electrodes by sample index, whatever the arrival order", () => {
    const r = new SessionRecorder();
    r.feed("AF7", 1200, packet(2));
    r.feed("TP9", 1200, packet(1));
    r.feed("AF8", 1200, packet(3));
    r.feed("TP10", 1200, packet(4));
    r.feed("TP9", 1212, packet(1));
    r.feed("AF7", 1212, packet(2));
    r.feed("AF8", 1212, packet(3));
    r.feed("TP10", 1212, packet(4));
    const c = r.stop();
    expect(c.blocks).toHaveLength(2);
    expect(c.blocks[0].sampleIndex).toBe(1200);
    expect(c.firstSampleIndex).toBe(1200);
    expect(c.lastSampleIndex).toBe(1223);
    expect(c.sampleCount).toBe(24);
    expect(c.missingSamples).toBe(0);
    expect(c.durationS).toBeCloseTo(24 / 256);
  });

  test("counts lost packets as missing samples and keeps partial blocks", () => {
    const r = new SessionRecorder();
    for (const ch of EEG_CHANNELS) r.feed(ch, 0, packet(1));
    for (const ch of EEG_CHANNELS) r.feed(ch, 24, packet(1)); // the packet at 12 was lost
    r.feed("TP9", 36, packet(1)); // other electrodes never arrive for this one
    const c = r.stop();
    expect(c.blocks.map((b) => b.sampleIndex)).toEqual([0, 24, 36]);
    expect(c.missingSamples).toBe(12);
    expect(c.blocks[2].channels.AF7).toBeUndefined();
  });

  test("takes the Athena's shorter packets without a special case", () => {
    const r = new SessionRecorder();
    for (let i = 0; i < 3; i++)
      for (const ch of EEG_CHANNELS) r.feed(ch, i * 4, packet(1, 4));
    const c = r.stop();
    expect(c.blocks).toHaveLength(3);
    expect(c.sampleCount).toBe(12);
    expect(c.firstSampleIndex).toBe(0);
    expect(c.lastSampleIndex).toBe(11);
    expect(c.missingSamples).toBe(0);
  });

  test("seconds grows with the device clock", () => {
    const r = new SessionRecorder();
    for (let i = 0; i < 64; i++)
      for (const ch of EEG_CHANNELS) r.feed(ch, i * 12, packet(0));
    expect(r.seconds).toBeCloseTo(3);
  });
});

describe("buildSessionCsv", () => {
  test("writes the header line, the columns and one row per sample", () => {
    const r = new SessionRecorder();
    for (const ch of EEG_CHANNELS)
      r.feed(ch, 120, packet(EEG_CHANNELS.indexOf(ch)));
    r.feed("TP9", 132, packet(9));
    const csv = buildSessionCsv(r.stop(), {
      deviceName: "Muse 1A2B",
      model: "muse-2",
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
      /^# brain-trails-session v1 sfreq=256 device=Muse_1A2B device_model=muse-2 /
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
      model: "simulated",
      timeline: null,
    });
    expect(csv.split("\n")[0]).toContain("jitter_rms_ms=na");
  });

  test("an Athena session has the same columns and one row per sample", () => {
    const r = new SessionRecorder();
    for (let i = 0; i < 3; i++)
      for (const ch of EEG_CHANNELS) r.feed(ch, i * 4, packet(1, 4));
    const csv = buildSessionCsv(r.stop(), {
      deviceName: "MuseS-4B1C",
      model: "athena",
      timeline: null,
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("device_model=athena");
    expect(lines[1]).toBe("sample_index,t_session_s,TP9,AF7,AF8,TP10");
    expect(lines[2]).toBe("0,0.000000,1.00,1.00,1.00,1.00");
    expect(lines).toHaveLength(2 + 12);
  });
});

describe("ExtrasRecorder + buildExtrasCsv", () => {
  test("keeps per-stream counters and writes samples on the EEG clock", () => {
    const eeg = new SessionRecorder();
    for (const ch of EEG_CHANNELS) eeg.feed(ch, 1200, packet(0));
    const capture = eeg.stop(); // firstSampleIndex = 1200
    const x = new ExtrasRecorder();
    const acc = () => Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    x.feed("acc", 65535 * 3, acc(), 1000);
    x.feed("acc", 65536 * 3, acc(), 1057.7);
    x.feed("ppg_infrared", 42, Float32Array.from([1, 2, 3, 4, 5, 6]), 1000);
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
    // acc packet at index 65535*3: three readings, the last at t=0, earlier ones 1/52 s apart
    expect(lines[2]).toBe(
      `acc,${65535 * 3},${(-2 / 52).toFixed(6)},0.0000,0.0000,1.0000`
    );
    expect(lines[4]).toBe(`acc,${65535 * 3 + 2},0.000000,0.0000,0.0000,1.0000`);
    expect(lines[5].startsWith(`acc,${65536 * 3},`)).toBe(true);
    // ppg: one value per row, last sample at t=0
    expect(lines[13]).toBe("ppg_infrared,47,0.000000,6,,");
  });

  test("writes 'na' times when the EEG clock fit is missing", () => {
    const x = new ExtrasRecorder();
    x.feed("gyro", 3, new Float32Array(9), 5);
    const csv = buildExtrasCsv(x.stop(), new SessionRecorder().stop(), null);
    expect(csv.split("\n")[2]).toMatch(/^gyro,3,na,/);
  });
});
