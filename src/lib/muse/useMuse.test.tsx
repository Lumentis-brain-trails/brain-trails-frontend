import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SimulatedMuse } from "./device";
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

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.status).toBe("idle");
  });

  test("surfaces a connection failure as an error state", async () => {
    const failing = {
      name: "x",
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
