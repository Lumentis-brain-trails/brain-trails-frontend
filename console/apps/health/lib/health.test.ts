import { describe, expect, test } from "vitest";
import {
  type Container,
  type Pod,
  logTargets,
  memoryLevel,
  mib,
  podTrouble,
  shortId,
  since,
  sortPods,
} from "./health";

const container = (over: Partial<Container> = {}): Container => ({
  name: "main",
  ready: true,
  restarts: 0,
  state: "running",
  reason: null,
  last: null,
  memory_used_mib: 100,
  memory_request_mib: 128,
  memory_limit_mib: 512,
  ...over,
});

const pod = (name: string, c: Container = container()): Pod => ({
  name,
  app: name,
  phase: "Running",
  ready: c.ready,
  started_at: null,
  age_s: 100,
  containers: [c],
});

describe("health helpers", () => {
  test("memory is measured against the limit, or the request without one", () => {
    expect(memoryLevel(container())).toEqual({ share: 100 / 512, level: "ok" });
    expect(memoryLevel(container({ memory_used_mib: 400 })).level).toBe("high");
    expect(memoryLevel(container({ memory_used_mib: 470 })).level).toBe(
      "critical"
    );
    expect(
      memoryLevel(container({ memory_limit_mib: null, memory_used_mib: 120 }))
        .level
    ).toBe("critical");
    expect(memoryLevel(container({ memory_used_mib: null })).level).toBe(
      "unknown"
    );
    expect(
      memoryLevel(
        container({ memory_limit_mib: null, memory_request_mib: null })
      ).level
    ).toBe("unknown");
  });

  test("an OOM loop, a recent restart or a waiting container is trouble", () => {
    const oom = container({
      ready: false,
      restarts: 902,
      state: "waiting",
      reason: "CrashLoopBackOff",
      last: {
        reason: "OOMKilled",
        exit_code: 137,
        finished_at: null,
        ago_s: 240,
      },
    });
    const old = container({
      restarts: 1,
      last: {
        reason: "Error",
        exit_code: 1,
        finished_at: null,
        ago_s: 3 * 86_400,
      },
    });
    expect(podTrouble(pod("w", oom))).toBe(true);
    expect(podTrouble(pod("a", old))).toBe(false);
    expect(podTrouble(pod("o"))).toBe(false);
    expect(
      podTrouble({
        ...pod("j", container({ state: "terminated" })),
        phase: "Succeeded",
      })
    ).toBe(false);
    expect(sortPods([pod("a", old), pod("w", oom)]).map((p) => p.name)).toEqual(
      ["w", "a"]
    );
  });

  test("ids, sizes and ages read the way the page writes them", () => {
    expect(shortId("1a2b3c4d-0000-0000-0000-000000000000")).toBe("1a2b3c4d");
    expect(shortId(null)).toBe("–");
    expect(mib(940.4)).toBe("940 MiB");
    expect(mib(2457.6)).toBe("2.4 GiB");
    expect(mib(null)).toBe("–");
    expect(since(240, 60)).toBe(300);
    expect(since(null, 60)).toBeNull();
  });

  test("a previous log exists only for a container that ran before", () => {
    const restarted = container({ restarts: 3 });
    expect(logTargets([pod("a"), pod("w", restarted)])).toEqual([
      { pod: "a", container: "main", previous: false },
      { pod: "w", container: "main", previous: true },
    ]);
  });
});
