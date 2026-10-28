// @vitest-environment node
/**
 * The console's BFF: the two proxies (bt-ops and the product API), and the sign-in
 * routes. The security boundary of the console, so every refusal is tested here.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
  }),
}));

import * as opsProxy from "./ops/[...path]/route";
import * as productProxy from "./product/[...path]/route";
import * as sessionRoute from "./session/route";
import * as enrollRoute from "./session/totp/enroll/route";
import * as verifyRoute from "./session/totp/verify/route";

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

type Reply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};
let replies: Reply[];
let fetchSpy: ReturnType<typeof vi.fn>;

function json(reply: Reply): Response {
  const status = reply.status ?? 200;
  if (status === 204) return new Response(null, { status });
  return new Response(
    reply.body === undefined ? "" : JSON.stringify(reply.body),
    {
      status,
      headers: { "Content-Type": "application/json", ...reply.headers },
    }
  );
}

beforeEach(() => {
  jar.clear();
  replies = [];
  fetchSpy = vi
    .fn()
    .mockImplementation(async () =>
      json(replies.shift() ?? { body: { ok: true } })
    );
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const call = (i: number) => {
  const [url, init] = fetchSpy.mock.calls[i];
  return {
    url: String(url),
    init: init as RequestInit & { headers: Record<string, string> },
  };
};

describe("the bt-ops proxy", () => {
  test("refuses paths outside the allow-list, session included, without calling bt-ops", async () => {
    for (const path of [
      ["session"],
      ["metrics"],
      ["apps", "..", "session"],
      ["apps%2F..%2Fsession"],
      ["apps", "..%5Csession"],
    ]) {
      const res = await opsProxy.GET(
        new NextRequest("http://c/api/ops/x"),
        ctx(path)
      );
      expect(res.status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("attaches the console session and the BFF key, keeps the query", async () => {
    jar.set("bto_session", "ops-token");
    const res = await opsProxy.GET(
      new NextRequest("http://c/api/ops/worklog/entries?area=OPS%20O1&limit=5"),
      ctx(["worklog", "entries"])
    );
    expect(res.status).toBe(200);
    const { url, init } = call(0);
    expect(url).toBe(
      "http://localhost:8100/ops/v1/worklog/entries?area=OPS+O1&limit=5"
    );
    expect(init.headers.Authorization).toBe("Bearer ops-token");
    expect(init.headers["X-Ops-Key"]).toBe("local-ops-bff-key");
    expect(init.headers["X-Client-IP"]).toBeUndefined();
  });

  test("reaches Health's log route with its query", async () => {
    jar.set("bto_session", "ops-token");
    const res = await opsProxy.GET(
      new NextRequest(
        "http://c/api/ops/health/logs?pod=bt-worker-1&previous=true&tail=200"
      ),
      ctx(["health", "logs"])
    );
    expect(res.status).toBe(200);
    expect(call(0).url).toBe(
      "http://localhost:8100/ops/v1/health/logs?pod=bt-worker-1&previous=true&tail=200"
    );
  });

  test("passes paging and download headers back, and bodies forward", async () => {
    jar.set("bto_session", "t");
    replies.push({
      body: [],
      headers: { "x-next-cursor": "abc", "content-disposition": "attachment" },
    });
    const res = await opsProxy.PUT(
      new NextRequest("http://c/api/ops/pins", {
        method: "PUT",
        body: JSON.stringify([{ slug: "worklog" }]),
        headers: { "content-type": "application/json", "if-match": "e1" },
      }),
      ctx(["pins"])
    );
    expect(res.headers.get("x-next-cursor")).toBe("abc");
    expect(res.headers.get("content-disposition")).toBe("attachment");
    const { init } = call(0);
    expect(init.method).toBe("PUT");
    expect(init.headers["if-match"]).toBe("e1");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(
      '[{"slug":"worklog"}]'
    );
  });

  test("relays a 204 without a body and a dead service as 503", async () => {
    replies.push({ status: 204 });
    expect(
      (
        await opsProxy.DELETE(
          new NextRequest("http://c/x", { method: "DELETE" }),
          ctx(["pins"])
        )
      ).status
    ).toBe(204);
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    const res = await opsProxy.POST(
      new NextRequest("http://c/x", { method: "POST" }),
      ctx(["apps"])
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("upstream_unavailable");
  });

  test("a production build without its configuration answers 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await opsProxy.GET(new NextRequest("http://c/x"), ctx(["me"]));
    expect(res.status).toBe(503);
    expect(
      (await productProxy.GET(new NextRequest("http://c/x"), ctx(["admin"])))
        .status
    ).toBe(503);
    const login = await sessionRoute.POST(
      new NextRequest("http://c/x", { method: "POST", body: "{}" })
    );
    expect(login.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the product proxy", () => {
  test("reaches the product's admin routes with the product token only", async () => {
    jar.set("bto_product", "product-token");
    jar.set("bto_session", "ops-token");
    await productProxy.POST(
      new NextRequest("http://c/api/product/admin/applications/1/decide", {
        method: "POST",
        body: "{}",
      }),
      ctx(["admin", "applications", "1", "decide"])
    );
    const { url, init } = call(0);
    expect(url).toBe("http://localhost:8000/admin/applications/1/decide");
    expect(init.headers.Authorization).toBe("Bearer product-token");
    expect(init.headers["X-Ops-Key"]).toBeUndefined();
    const res = await productProxy.GET(
      new NextRequest("http://c/x"),
      ctx(["auth", "me"])
    );
    expect(res.status).toBe(403);
  });

  test("PUT, PATCH and DELETE go through too", async () => {
    await productProxy.PUT(
      new NextRequest("http://c/x", { method: "PUT", body: "{}" }),
      ctx(["admin", "x"])
    );
    await productProxy.PATCH(
      new NextRequest("http://c/x", { method: "PATCH", body: "{}" }),
      ctx(["admin", "protocols", "p", "access"])
    );
    await productProxy.DELETE(
      new NextRequest("http://c/x", { method: "DELETE" }),
      ctx(["admin", "x"])
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(call(1).init.method).toBe("PATCH");
  });

  test("the catalog and the flags are read, never written", async () => {
    jar.set("bto_product", "product-token");
    const read = await productProxy.GET(
      new NextRequest(
        "http://c/api/product/protocols?circle=official&include_locked=true"
      ),
      ctx(["protocols"])
    );
    expect(read.status).toBe(200);
    expect(call(0).url).toBe(
      "http://localhost:8000/protocols?circle=official&include_locked=true"
    );
    for (const path of [["protocols", "p", "publish"], ["config"]]) {
      const write = await productProxy.POST(
        new NextRequest("http://c/x", { method: "POST", body: "{}" }),
        ctx(path)
      );
      expect(write.status).toBe(403);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

const login = (body: unknown) =>
  sessionRoute.POST(
    new NextRequest("http://c/api/session", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

describe("signing in", () => {
  test("product login, then the exchange at bt-ops, then two httpOnly cookies", async () => {
    replies.push({ body: { access_token: "product-token" } });
    replies.push({
      body: { token: "ops-token", stage: "pending", next: "enroll" },
    });
    const res = await login({ email: "a@example.com", password: "pw" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: "enroll" });
    expect(call(0).url).toBe("http://localhost:8000/auth/login");
    expect(call(1).url).toBe("http://localhost:8100/ops/v1/session");
    expect(JSON.parse(String(call(1).init.body))).toEqual({
      product_token: "product-token",
    });
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("bto_session=ops-token");
    expect(cookies).toContain("bto_product=product-token");
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=strict/i);
    expect(cookies).toContain("Max-Age=600");
  });

  test("missing fields are a 422 and call nobody", async () => {
    expect((await login({ email: "a@example.com" })).status).toBe(422);
    const garbled = await sessionRoute.POST(
      new NextRequest("http://c/x", { method: "POST", body: "{" })
    );
    expect(garbled.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a refused product login or console exchange is relayed as is", async () => {
    replies.push({
      status: 401,
      body: { error: { code: "invalid_credentials", message: "no" } },
    });
    const refused = await login({ email: "a@example.com", password: "bad" });
    expect(refused.status).toBe(401);
    expect(refused.headers.getSetCookie()).toEqual([]);
    replies.push({ body: { access_token: "p" } });
    replies.push({
      status: 403,
      body: { error: { code: "not_a_console_user", message: "no" } },
    });
    const stranger = await login({ email: "b@example.com", password: "pw" });
    expect(stranger.status).toBe(403);
    expect((await stranger.json()).error.code).toBe("not_a_console_user");
  });

  test("an unreachable service is a 503", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    const res = await login({ email: "a@example.com", password: "pw" });
    expect(res.status).toBe(503);
  });

  test("signing out revokes at bt-ops and clears both cookies", async () => {
    jar.set("bto_session", "ops-token");
    replies.push({ status: 204 });
    const res = await sessionRoute.DELETE();
    expect(res.status).toBe(204);
    expect(call(0).init.method).toBe("DELETE");
    expect(call(0).init.headers.Authorization).toBe("Bearer ops-token");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("bto_session=;");
    expect(cookies).toContain("bto_product=;");
    jar.clear();
    await sessionRoute.DELETE();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("the second factor", () => {
  test("enrol and verify need the pending cookie", async () => {
    expect((await enrollRoute.POST()).status).toBe(401);
    const req = new NextRequest("http://c/x", {
      method: "POST",
      body: '{"code":"123456"}',
    });
    expect((await verifyRoute.POST(req)).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("enrolment relays the QR code from bt-ops", async () => {
    jar.set("bto_session", "pending");
    replies.push({
      body: { qr_svg: "<svg/>", secret: "S", otpauth_uri: "otpauth://x" },
    });
    const res = await enrollRoute.POST();
    expect(await res.json()).toMatchObject({ secret: "S" });
    expect(call(0).url).toBe(
      "http://localhost:8100/ops/v1/session/totp/enroll"
    );
  });

  test("a right code keeps the same token for twelve hours", async () => {
    jar.set("bto_session", "pending");
    replies.push({ body: { stage: "active", next: "none" } });
    const res = await verifyRoute.POST(
      new NextRequest("http://c/x", {
        method: "POST",
        body: '{"code":"123456"}',
        headers: { "x-real-ip": "198.51.100.4" },
      })
    );
    expect(res.status).toBe(200);
    expect(call(0).init.headers["X-Client-IP"]).toBe("198.51.100.4");
    expect(JSON.parse(String(call(0).init.body))).toEqual({ code: "123456" });
    const cookie = res.headers.getSetCookie().join("\n");
    expect(cookie).toContain("bto_session=pending");
    expect(cookie).toContain(`Max-Age=${12 * 3600}`);
  });

  test("a wrong code is relayed and the cookie stays as it was", async () => {
    jar.set("bto_session", "pending");
    replies.push({
      status: 401,
      body: { error: { code: "wrong_code", message: "no" } },
    });
    const res = await verifyRoute.POST(
      new NextRequest("http://c/x", { method: "POST", body: "nope" })
    );
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(JSON.parse(String(call(0).init.body))).toEqual({ code: "" });
  });
});

describe("the visitor's address", () => {
  test("goes to bt-ops with the sign-in and every proxied call, first hop only", async () => {
    replies.push({ body: { access_token: "p" } });
    replies.push({ body: { token: "t", stage: "pending", next: "verify" } });
    await sessionRoute.POST(
      new NextRequest("http://c/api/session", {
        method: "POST",
        body: JSON.stringify({ email: "a@example.com", password: "pw" }),
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      })
    );
    expect(call(1).init.headers["X-Client-IP"]).toBe("203.0.113.7");
    expect(call(0).init.headers["X-Client-IP"]).toBeUndefined(); // not to the product
    await opsProxy.GET(
      new NextRequest("http://c/api/ops/me", {
        headers: { "x-real-ip": "198.51.100.9" },
      }),
      ctx(["me"])
    );
    expect(call(2).init.headers["X-Client-IP"]).toBe("198.51.100.9");
    await opsProxy.GET(new NextRequest("http://c/api/ops/me"), ctx(["me"]));
    expect(call(3).init.headers["X-Client-IP"]).toBeUndefined();
  });
});
