import { afterEach, describe, expect, test, vi } from "vitest";
import { ops, opsIn } from "./client";
import {
  type EnvsOut,
  cacheEnv,
  chooseEnv,
  envStorageKey,
  envTone,
  isAvailable,
  isEnv,
  readStoredEnv,
  storeEnv,
} from "./env";

const ENVS: EnvsOut = {
  home: "dev",
  envs: [
    { id: "dev", available: true },
    { id: "beta", available: false },
    { id: "prod", available: true },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("the environment an app reads", () => {
  test("only the three names are environments", () => {
    for (const e of ["dev", "beta", "prod"]) expect(isEnv(e)).toBe(true);
    for (const e of ["PROD", "prod ", "", null, undefined, 1, "staging"])
      expect(isEnv(e)).toBe(false);
  });

  test("the URL wins, even on an environment that cannot be read", () => {
    expect(chooseEnv(ENVS, "prod", "dev")).toBe("prod");
    expect(chooseEnv(ENVS, "beta", null)).toBe("beta");
  });

  test("then the remembered choice while it is readable, then home", () => {
    expect(chooseEnv(ENVS, null, "prod")).toBe("prod");
    expect(chooseEnv(ENVS, "nonsense", "prod")).toBe("prod");
    expect(chooseEnv(ENVS, null, "beta")).toBe("dev");
    expect(chooseEnv(ENVS, null, null)).toBe("dev");
    expect(isAvailable(ENVS, "beta")).toBe(false);
  });

  test("the choice is remembered per app, and storage failures are quiet", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    storeEnv(storage, "statistics", "prod");
    expect(store.get(envStorageKey("statistics"))).toBe("prod");
    expect(readStoredEnv(storage, "statistics")).toBe("prod");
    expect(readStoredEnv(storage, "health")).toBeNull();
    store.set(envStorageKey("health"), "staging");
    expect(readStoredEnv(storage, "health")).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredEnv(broken, "statistics")).toBeNull();
    expect(() => storeEnv(broken, "statistics", "prod")).not.toThrow();
    expect(readStoredEnv(undefined, "statistics")).toBeNull();
  });

  test("prod is red, beta amber, dev neutral", () => {
    expect(envTone("prod")).toBe("danger");
    expect(envTone("beta")).toBe("warn");
    expect(envTone("dev")).toBe("neutral");
  });

  test("home shares one cache slot with header-less reads; the others have their own", () => {
    expect(cacheEnv(null, null)).toBe("home");
    expect(cacheEnv("dev", "dev")).toBe("home");
    expect(cacheEnv(null, "dev")).toBe("home");
    expect(cacheEnv("prod", "dev")).toBe("prod");
    expect(cacheEnv("beta", null)).toBe("beta");
  });
});

describe("the client of one environment", () => {
  test("names it in X-Ops-Env on every call; the plain client names none", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response("[]", { status: 200, headers: { "x-next-cursor": "c" } })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const prod = opsIn("prod");
    await prod.get("snapshots/statistics.signups");
    await prod.post("snapshots/statistics.signups/refresh", { params: {} });
    await prod.put("x", {});
    await prod.delete("x");
    expect(await prod.page("x")).toEqual({ items: [], next: "c" });
    await ops.get("me");
    await ops.post("apps/x/open");
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const headers = calls.map(
      (c) => c[1]?.headers as Record<string, string> | undefined
    );
    for (const h of headers.slice(0, 5)) expect(h?.["X-Ops-Env"]).toBe("prod");
    expect(headers[1]?.["Content-Type"]).toBe("application/json");
    expect(headers[5]).toBeUndefined();
    expect(headers[6]).toEqual({ "Content-Type": "application/json" });
    expect(calls[6][1].body).toBe("{}");
  });
});
