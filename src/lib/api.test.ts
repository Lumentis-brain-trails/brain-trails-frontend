import { afterEach, describe, expect, test, vi } from "vitest";
import { api, ApiRequestError } from "./api";

/** Build a minimal fetch mock returning the given status/body. */
function mockFetch(status: number, body: unknown, json = true) {
  // A fresh Response per call: a body can only be read once.
  const spy = vi.fn().mockImplementation(
    async () =>
      new Response(json ? JSON.stringify(body) : String(body), {
        status,
        statusText: status === 500 ? "Internal Server Error" : "OK",
        headers: { "Content-Type": json ? "application/json" : "text/plain" },
      })
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  test("get prefixes the BFF path and parses JSON", async () => {
    const spy = mockFetch(200, { items: [1] });
    const result = await api.get<{ items: number[] }>("recordings");
    expect(result.items).toEqual([1]);
    expect(spy.mock.calls[0][0]).toBe("/api/backend/recordings");
  });

  test("post serialises the body and omits it when undefined", async () => {
    const spy = mockFetch(200, { ok: true });
    await api.post("recordings/complete", { key: "k" });
    expect(spy.mock.calls[0][1].method).toBe("POST");
    expect(spy.mock.calls[0][1].body).toBe(JSON.stringify({ key: "k" }));
    await api.post("recordings/x");
    expect(spy.mock.calls[1][1].body).toBeUndefined();
  });

  test("errors surface the backend error envelope", async () => {
    mockFetch(403, { error: { code: "forbidden", message: "nope" } });
    await expect(api.get("admin/users")).rejects.toMatchObject({
      status: 403,
      error: { code: "forbidden", message: "nope" },
    });
  });

  test("non-JSON error bodies fall back to statusText", async () => {
    mockFetch(500, "boom", false);
    const err = await api.get("recordings").catch((e: ApiRequestError) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).error.code).toBe("unknown");
  });

  test("delete sends the method and an optional JSON body", async () => {
    const spy = mockFetch(200, { status: "deleted" });
    await api.delete("recordings/abc");
    expect(spy.mock.calls[0][1].method).toBe("DELETE");
    expect(spy.mock.calls[0][1].body).toBeUndefined();
    await api.delete("auth/me", { password: "pw" });
    expect(spy.mock.calls[1][1].body).toBe(JSON.stringify({ password: "pw" }));
  });

  test("login and logout hit the auth routes", async () => {
    const spy = mockFetch(200, { status: "ok" });
    await api.login("a@b.it", "pw-long-enough");
    expect(spy.mock.calls[0][0]).toBe("/api/auth/login");
    await api.logout();
    expect(spy.mock.calls[1][0]).toBe("/api/auth/logout");
  });
});
