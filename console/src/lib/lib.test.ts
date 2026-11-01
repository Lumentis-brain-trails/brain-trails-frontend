import { afterEach, describe, expect, test, vi } from "vitest";
import { appPath, parseAppRef } from "./appRef";
import { OpsRequestError, ops, query, session } from "./client";
import { ageParts, isStale, tokens } from "./format";
import { forgetOpenApp, readOpenApps, rememberOpenApp } from "./openApps";
import { serverEnv } from "./server";
import { allowedSegments, isAllowed } from "./forward";
import { safeFrom } from "./safePath";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("app addresses", () => {
  test("a slug, or a slug at a version, nothing else", () => {
    expect(parseAppRef("worklog")).toEqual({ slug: "worklog", semver: null });
    expect(parseAppRef("worklog%401.2.0")).toEqual({
      slug: "worklog",
      semver: "1.2.0",
    });
    expect(parseAppRef("worklog@1.2")).toBeNull();
    expect(parseAppRef("Work Log")).toBeNull();
    expect(parseAppRef("a@1.0.0@2")).toBeNull();
    expect(appPath("worklog")).toBe("/apps/worklog");
    expect(appPath("worklog", "1.0.0")).toBe("/apps/worklog@1.0.0");
  });
});

describe("formatting", () => {
  test("tokens read like the work log writes them", () => {
    expect(tokens(15_263_519)).toBe("15.3 M");
    expect(tokens(191_928)).toBe("192 k");
    expect(tokens(12)).toBe("12");
  });

  test("ages in the largest whole unit; a day is stale", () => {
    expect(ageParts(10)).toEqual({ unit: "now", n: 0 });
    expect(ageParts(125)).toEqual({ unit: "m", n: 2 });
    expect(ageParts(7300)).toEqual({ unit: "h", n: 2 });
    expect(ageParts(200_000)).toEqual({ unit: "d", n: 2 });
    expect(isStale(86_399)).toBe(false);
    expect(isStale(86_400)).toBe(true);
  });
});

describe("open apps of the tab", () => {
  test("most recent first, eight at most, survives garbage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    for (const slug of ["a1", "b1", "a1"]) rememberOpenApp(storage, slug);
    expect(readOpenApps(storage)).toEqual(["a1", "b1"]);
    for (let i = 0; i < 10; i++) rememberOpenApp(storage, `x${i}`);
    expect(readOpenApps(storage)).toHaveLength(8);
    expect(forgetOpenApp(storage, "x9")).not.toContain("x9");
    store.set("bto-open-apps", "{not json");
    expect(readOpenApps(storage)).toEqual([]);
    store.set("bto-open-apps", '{"a":1}');
    expect(readOpenApps(storage)).toEqual([]);
    expect(readOpenApps(undefined)).toEqual([]);
    const broken = {
      getItem: () => "[]",
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(rememberOpenApp(broken, "z1")).toEqual(["z1"]);
    expect(forgetOpenApp(broken, "z1")).toEqual([]);
  });
});

describe("the BFF's configuration", () => {
  test("local defaults, and a production build that names everything or answers 503", () => {
    expect(serverEnv()).toMatchObject({
      opsUrl: "http://localhost:8100",
      configured: true,
      secureCookies: true,
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(serverEnv()).toMatchObject({ configured: false, bffKey: "" });
    vi.stubEnv("OPS_API_URL", "https://ops");
    vi.stubEnv("OPS_BFF_KEY", "k");
    vi.stubEnv("API_URL", "https://api");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(serverEnv()).toMatchObject({
      configured: true,
      opsUrl: "https://ops",
      secureCookies: false,
    });
  });

  test("the allow-list reads the first segment and refuses dot segments", () => {
    expect(isAllowed("worklog/entries", ["worklog"])).toBe(true);
    expect(isAllowed("worklogx", ["worklog"])).toBe(false);
    expect(isAllowed("worklog/../session", ["worklog"])).toBe(false);
  });
});

describe("the browser client", () => {
  test("query leaves the empty parameters out", () => {
    expect(query({ a: "x", b: "", c: null, d: undefined, e: 0 })).toBe(
      "?a=x&e=0"
    );
    expect(query({})).toBe("");
  });

  test("errors carry the backend's code and say what to do", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: "second_factor", message: "m" } }),
            { status: 401 }
          )
      )
    );
    const error = (await ops.get("me").catch((e) => e)) as OpsRequestError;
    expect(error).toBeInstanceOf(OpsRequestError);
    expect(error.needsSecondFactor).toBe(true);
    expect(error.signedOut).toBe(false);
    expect(new OpsRequestError(401, "signed_out", "m").signedOut).toBe(true);
    expect(new OpsRequestError(401, "wrong_code", "m").signedOut).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500, statusText: "Boom" }))
    );
    const bare = (await ops.get("me").catch((e) => e)) as OpsRequestError;
    expect(bare.code).toBe("error");
  });

  test("calls go to the BFF with JSON bodies; pages carry the next cursor", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response("[1]", { status: 200, headers: { "x-next-cursor": "n1" } })
    );
    vi.stubGlobal("fetch", fetchSpy);
    expect(await ops.page("worklog/entries")).toEqual({
      items: [1],
      next: "n1",
    });
    await ops.post("apps/worklog/open", { semver: null });
    await ops.put("pins", []);
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    expect(calls[1][0]).toBe("/api/ops/apps/worklog/open");
    expect(calls[1][1].body).toBe('{"semver":null}');
    expect(calls[2][1].method).toBe("PUT");
  });

  test("the sign-in steps use the BFF's own routes", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ next: "verify" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);
    await session.open("a@example.com", "pw");
    await session.enroll();
    await session.verify("123456");
    fetchSpy.mockImplementationOnce(
      async () => new Response(null, { status: 204 })
    );
    await session.close();
    const urls = (fetchSpy.mock.calls as unknown as [string][]).map(
      (c) => c[0]
    );
    expect(urls).toEqual([
      "/api/session",
      "/api/session/totp/enroll",
      "/api/session/totp/verify",
      "/api/session",
    ]);
  });
});

describe("the open-apps store", () => {
  test("subscribers hear of an open, the snapshot is stable until the list changes", async () => {
    const {
      noteOpened,
      openAppsServerSnapshot,
      openAppsSnapshot,
      subscribeOpenApps,
    } = await import("./openApps");
    window.sessionStorage.clear();
    const heard: number[] = [];
    const stop = subscribeOpenApps(() => heard.push(1));
    const before = openAppsSnapshot();
    expect(openAppsSnapshot()).toBe(before);
    noteOpened("worklog");
    expect(heard).toHaveLength(1);
    expect(openAppsSnapshot()).toEqual(["worklog"]);
    expect(openAppsSnapshot()).toBe(openAppsSnapshot());
    stop();
    noteOpened("overview");
    expect(heard).toHaveLength(1);
    expect(openAppsServerSnapshot()).toEqual([]);
  });
});

describe("where a sign-in may send the person", () => {
  test("a path on this site only", () => {
    expect(safeFrom("/apps/worklog")).toBe("/apps/worklog");
    expect(safeFrom("/")).toBe("/");
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/apps\\..\\x",
      "https://evil.com",
      "evil.com",
      "/a\u0000b",
      "",
      null,
      undefined,
    ]) {
      expect(safeFrom(bad), String(bad)).toBeNull();
    }
  });
});

describe("the BFF allow-list", () => {
  const allowed = ["worklog", "apps", "snapshots"];
  test("plain segments under an allowed first segment pass, decoded", () => {
    expect(allowedSegments(["worklog", "entries"], allowed)).toEqual([
      "worklog",
      "entries",
    ]);
    expect(
      allowedSegments(["snapshots", "worklog.week%3Aab12"], allowed)
    ).toEqual(["snapshots", "worklog.week:ab12"]);
    expect(allowedSegments(["apps", "worklog@1.0.0"], allowed)).toEqual([
      "apps",
      "worklog@1.0.0",
    ]);
  });

  test("encoded slashes, backslashes, dot segments and odd characters are refused", () => {
    for (const path of [
      ["worklog%2F..%2Fsession"],
      ["worklog", "..%5Csession"],
      ["worklog", "a\\b"],
      ["worklog", "%2e%2e"],
      ["worklog", ".."],
      ["worklog", "."],
      ["worklog", "a b"],
      ["worklog", "%E0%A4%A"],
      ["session"],
      [],
    ]) {
      expect(allowedSegments(path, allowed), path.join("/")).toBeNull();
    }
  });
});
