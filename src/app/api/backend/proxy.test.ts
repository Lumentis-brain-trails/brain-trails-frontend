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

import { DELETE, GET, PATCH, POST, PUT } from "./[...path]/route";

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

  test("forwards PUT and PATCH, the If-Match header, and relays ETag", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"8"' },
        })
    );
    const put = new NextRequest("http://localhost/api/backend/media/m1", {
      method: "PUT",
      body: "{}",
      headers: { "Content-Type": "application/json", "If-Match": "7" },
    });
    const res = await PUT(put, ctx(["media", "m1"]));
    expect(fetchSpy.mock.calls[0][1].method).toBe("PUT");
    expect(fetchSpy.mock.calls[0][1].headers["if-match"]).toBe("7");
    expect(res.headers.get("etag")).toBe('"8"');

    const patch = new NextRequest("http://localhost/api/backend/media/m1", {
      method: "PATCH",
      body: "{}",
    });
    await PATCH(patch, ctx(["media", "m1"]));
    expect(fetchSpy.mock.calls[1][1].method).toBe("PATCH");
    expect(fetchSpy.mock.calls[1][1].headers["if-match"]).toBeUndefined();
  });

  test("allows the public configuration endpoint", async () => {
    const req = new NextRequest("http://localhost/api/backend/config");
    const res = await GET(req, ctx(["config"]));
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "http://localhost:8000/config"
    );
  });

  test("allows the caller's own brain landscape", async () => {
    const req = new NextRequest("http://localhost/api/backend/landscape");
    const res = await GET(req, ctx(["landscape"]));
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "http://localhost:8000/landscape"
    );
  });

  // Left off the allow-list once, and every closed-list menu in the app rendered
  // disabled with no way to tell why: the registration form needs these before anyone
  // has an account, so they cannot ride on an authenticated path.
  test("allows the public answer lists", async () => {
    const req = new NextRequest("http://localhost/api/backend/taxonomies");
    const res = await GET(req, ctx(["taxonomies"]));
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "http://localhost:8000/taxonomies"
    );
  });

  // Left off too, and the fair's "try the headband" tick never appeared: the form reads
  // this before anyone has an account, and a 403 reads as "stand closed".
  test("allows the public fair state", async () => {
    const req = new NextRequest("http://localhost/api/backend/fair");
    const res = await GET(req, ctx(["fair"]));
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "http://localhost:8000/fair"
    );
  });
});
