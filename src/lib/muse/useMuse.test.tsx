import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SimulatedMuse, type MuseDevice } from "./device";
import { CONTROL_CHARACTERISTIC, EEG_CHARACTERISTICS } from "./protocol";
import { useMuse } from "./useMuse";

describe("useMuse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("connects, fills buffers, refreshes quality and stats once a second", async () => {
    let sim: SimulatedMuse | null = null;
    const factory = () =>
      (sim = new SimulatedMuse({ autoplay: false, flatChannels: ["TP10"] }));
    const { result } = renderHook(() => useMuse(factory));
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("connected");
    expect(result.current.deviceName).toBe("Muse-SIM");
    expect(result.current.model).toBe("simulated");

    // Three seconds of packets (64 packets = 768 samples per channel).
    act(() => {
      for (let i = 0; i < 64; i++) sim!.tick(i * 46.875);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.quality.TP9.level).toBe("good");
    expect(result.current.quality.TP10.level).toBe("flat");
    expect(result.current.allGood).toBe(false);
    expect(result.current.packetRate).toBe(64);
    expect(result.current.timeline?.packets).toBe(64);
    expect(result.current.timeline?.lostPackets).toBe(0);
    expect(result.current.batteryPercent).toBe(76);
    expect(result.current.getRecent(1).AF7).toHaveLength(256);

    // Record two seconds, stop, and get a capture with the timing snapshot.
    act(() => result.current.startRecording());
    expect(result.current.isRecording).toBe(true);
    act(() => {
      for (let i = 64; i < 64 + 43; i++) sim!.tick(i * 46.875);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recordingSeconds).toBeCloseTo((43 * 12) / 256, 1);
    let stopped: ReturnType<typeof result.current.stopRecording> = null;
    act(() => {
      stopped = result.current.stopRecording();
    });
    expect(result.current.isRecording).toBe(false);
    expect(stopped!.capture.blocks).toHaveLength(43);
    expect(stopped!.extras.counts().acc).toBeGreaterThan(30);
    expect(stopped!.extras.counts().ppg_red).toBeGreaterThan(15);
    expect(result.current.sensors.accG).toBeCloseTo(1, 1);
    expect(result.current.sensors.ppgInfrared).toBeGreaterThan(100000);
    expect(stopped!.capture.missingSamples).toBe(0);
    expect(stopped!.timeline.packets).toBe(64 + 43);
    // The simulator has no Bluetooth link, so there is nothing raw to keep.
    expect(stopped!.raw.count).toBe(0);
    expect(result.current.sensors.rawPackets).toBe(0);

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.status).toBe("idle");
  });

  test("a recording's raw capture starts with the handshake seen at connect", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const emit = (name: string, e: unknown) =>
      listeners[name]?.forEach((l) => l(e));
    const raw = (characteristic: string, byte: number, hostMs: number) => ({
      characteristic,
      direction: "in" as const,
      bytes: new Uint8Array([byte]),
      hostMs,
    });
    const band = {
      name: "Muse-1A2B",
      model: "muse-2" as const,
      connect: async () => {
        emit("raw", raw(CONTROL_CHARACTERISTIC, 1, 1)); // firmware reply
        emit("raw", raw(EEG_CHARACTERISTICS.TP9, 2, 2)); // streaming, not recorded yet
      },
      disconnect: async () => {},
      on: (name: string, listener: (e: unknown) => void) => {
        (listeners[name] ??= []).push(listener);
        return () => {};
      },
    };
    const { result } = renderHook(() =>
      useMuse(() => band as unknown as MuseDevice)
    );
    await act(async () => {
      await result.current.connect();
    });
    act(() => result.current.startRecording());
    act(() => emit("raw", raw(EEG_CHARACTERISTICS.TP9, 3, 3)));
    let stopped: ReturnType<typeof result.current.stopRecording> = null;
    act(() => {
      stopped = result.current.stopRecording();
    });
    expect(stopped!.raw.stop().map((r) => r.bytes[0])).toEqual([1, 3]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.sensors.rawPackets).toBe(3);
  });

  test("surfaces a connection failure as an error state", async () => {
    const failing = {
      name: "x",
      model: "muse-2" as const,
      connect: async () => {
        throw new Error("GATT operation failed");
      },
      disconnect: async () => {},
      on: () => () => {},
    };
    const { result } = renderHook(() => useMuse(() => failing));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/GATT/);
  });
});
