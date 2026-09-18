// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

/** The proxy reads the JWT through next/headers; stub it per test. */
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bt_token" && cookieValue ? { value: cookieValue } : undefined,
  }),
}));

import { DELETE, GET, POST } from "./[...path]/route";

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  cookieValue = undefined;
  // A fresh Response per call: a body can only be read once.
  fetchSpy = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("BFF proxy", () => {
  test("rejects paths outside the allow-list without calling upstream", async () => {
    const req = new NextRequest("http://localhost/api/backend/metrics");
    const res = await GET(req, ctx(["metrics"]));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("forwards allow-listed paths with the cookie as a Bearer token and the query", async () => {
    cookieValue = "jwt-123";
    const req = new NextRequest(
      "http://localhost/api/backend/recordings?limit=5"
    );
    const res = await GET(req, ctx(["recordings"]));
    expect(res.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/recordings?limit=5");
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
    expect(init.body).toBeUndefined();
  });

  test("omits Authorization when there is no session cookie", async () => {
    const req = new NextRequest("http://localhost/api/backend/auth/register");
    await POST(req, ctx(["auth", "register"]));
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test("passes POST bodies and content-type through, and DELETE methods", async () => {
    const req = new NextRequest(
      "http://localhost/api/backend/recordings/uploads",
      {
        method: "POST",
        body: JSON.stringify({ filename: "a.csv" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    await POST(req, ctx(["recordings", "uploads"]));
    const init = fetchSpy.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(Buffer.from(init.body).toString()).toContain("a.csv");

    const del = new NextRequest("http://localhost/api/backend/auth/me", {
      method: "DELETE",
    });
    await DELETE(del, ctx(["auth", "me"]));
    expect(fetchSpy.mock.calls[1][1].method).toBe("DELETE");
  });

  test("relays upstream status and body", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
    const req = new NextRequest("http://localhost/api/backend/recordings/zzz");
    const res = await GET(req, ctx(["recordings", "zzz"]));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
  });
});
