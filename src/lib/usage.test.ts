import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_BATCH,
  USAGE_ENDPOINT,
  flush,
  isCategory,
  isTrackedRoute,
  resetUsage,
  routePattern,
  startUsage,
  track,
  trackFeature,
} from "./usage";

const ID = "3f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f";

let fetchSpy: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;

/** The events of every batch sent so far, by fetch or by beacon, in order. */
function sentBatches(): { event: string; at?: string; props?: object }[][] {
  const bodies = [
    ...fetchSpy.mock.calls.map(([, init]) => init.body as string),
    ...beacon.mock.calls.map(
      ([, blob]) => (blob as Blob & { text: string }).text
    ),
  ];
  return bodies.map((body) => JSON.parse(body).events);
}

beforeEach(() => {
  resetUsage();
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
  beacon = vi.fn(() => true);
  // jsdom's Blob has no synchronous text; keep the body next to it for the test
  vi.stubGlobal(
    "Blob",
    class {
      text: string;
      type: string;
      constructor(parts: string[], options: { type: string }) {
        this.text = parts.join("");
        this.type = options.type;
      }
    }
  );
  Object.defineProperty(navigator, "sendBeacon", {
    value: beacon,
    configurable: true,
  });
});
afterEach(() => {
  resetUsage();
  vi.unstubAllGlobals();
});

describe("routePattern", () => {
  test("puts each filled param back as its name", () => {
    expect(routePattern(`/protocols/${ID}/edit`, { id: ID })).toBe(
      "/protocols/[id]/edit"
    );
    expect(routePattern(`/recordings/${ID}/review`, { id: ID })).toBe(
      "/recordings/[id]/review"
    );
  });

  test("leaves a static route as it is", () => {
    expect(routePattern("/protocols/media", {})).toBe("/protocols/media");
    expect(routePattern("/home", null)).toBe("/home");
    expect(routePattern("", {})).toBe("/");
  });

  test("matches a param the URL carries encoded", () => {
    expect(routePattern("/tags/a%20b", { tag: "a b" })).toBe("/tags/[tag]");
  });

  test("keeps one placeholder for a catch-all", () => {
    expect(routePattern("/docs/a/b", { slug: ["a", "b"] })).toBe(
      "/docs/[...slug]"
    );
    expect(routePattern("/docs", { slug: undefined })).toBe("/docs");
  });

  test("two params of the same value each get their own place", () => {
    expect(routePattern("/a/x/b/x", { first: "x", second: "x" })).toBe(
      "/a/[first]/b/[second]"
    );
  });
});

describe("what is tracked", () => {
  test("the participant's run is not", () => {
    expect(isTrackedRoute("/protocols/[id]/run")).toBe(false);
    expect(isTrackedRoute("/protocols/[id]")).toBe(true);
    expect(isTrackedRoute("/runs")).toBe(true);
  });

  test("a category is short and names no one", () => {
    expect(isCategory("/protocols/[id]/edit")).toBe(true);
    expect(isCategory(`/protocols/${ID}`)).toBe(false);
    expect(isCategory("ada@lab.org")).toBe(false);
    expect(isCategory("x".repeat(41))).toBe(false);
  });
});

describe("track and flush", () => {
  test("records nothing while no tracker is running", () => {
    track("page.viewed", { route: "/home" });
    startUsage();
    flush("navigate");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a route-change flush sends one keepalive batch, then nothing", () => {
    startUsage();
    track("page.viewed", { route: "/home" });
    trackFeature("protocol.play");
    flush("navigate");
    flush("navigate");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(USAGE_ENDPOINT);
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    const [events] = sentBatches();
    expect(events.map((e) => e.event)).toEqual(["page.viewed", "feature.used"]);
    expect(events[1].props).toEqual({ feature: "protocol.play" });
    expect(new Date(events[0].at ?? "").getTime()).not.toBeNaN();
  });

  test("hiding the page sends a beacon", () => {
    startUsage();
    track("page.viewed", { route: "/home" });
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(USAGE_ENDPOINT);
    expect(fetchSpy).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  test("pagehide sends a beacon, and a refused beacon falls back to fetch", () => {
    startUsage();
    beacon.mockReturnValueOnce(false);
    track("page.viewed", { route: "/home" });
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("a full buffer leaves at once, never more than 50 a batch", () => {
    startUsage();
    for (let i = 0; i < MAX_BATCH + 3; i += 1) trackFeature("builder.publish");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    flush("navigate");
    expect(sentBatches().map((b) => b.length)).toEqual([MAX_BATCH, 3]);
  });

  test("drops an event whose props are not categories, keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    startUsage();
    track("page.viewed", { route: `/protocols/${ID}` });
    track("feature.used", {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9,
    });
    track("feature.used", { feature: "ok", count: 2, on: true });
    flush("navigate");
    expect(sentBatches()).toEqual([
      [
        expect.objectContaining({
          props: { feature: "ok", count: 2, on: true },
        }),
      ],
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("a failed request loses the counts and throws nothing", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("offline"));
    startUsage();
    trackFeature("protocol.play");
    expect(() => flush("navigate")).not.toThrow();
    await Promise.resolve();
  });

  test("stopping flushes and detaches; the last stop turns it off", () => {
    const stopA = startUsage();
    const stopB = startUsage();
    track("page.viewed", { route: "/home" });
    stopA();
    stopA();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    trackFeature("still.on");
    stopB();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    trackFeature("now.off");
    window.dispatchEvent(new Event("pagehide"));
    flush("navigate");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(beacon).not.toHaveBeenCalled();
  });
});
