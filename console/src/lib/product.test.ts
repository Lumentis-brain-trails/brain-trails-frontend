import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { api } from "./product";

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe("the product client", () => {
  test("goes through the console's BFF and sends JSON", async () => {
    fetchSpy.mockResolvedValueOnce(reply(200, [{ id: "u1" }]));
    expect(await api.get("admin/users")).toEqual([{ id: "u1" }]);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/product/admin/users");

    fetchSpy.mockResolvedValueOnce(reply(200, { ok: true }));
    await api.post("admin/applications/u1/decide", { decision: "accept" });
    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe("/api/product/admin/applications/u1/decide");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"decision":"accept"}');
  });

  test("passes If-Match and answers nothing on a 204", async () => {
    fetchSpy.mockResolvedValueOnce(reply(204));
    expect(
      await api.patch(
        "admin/protocols/p/access",
        { access: "locked" },
        { ifMatch: 3 }
      )
    ).toBeUndefined();
    expect(fetchSpy.mock.calls[0][1].headers["If-Match"]).toBe("3");
    fetchSpy.mockResolvedValueOnce(reply(204));
    await api.put("admin/fair", { enabled: true });
    fetchSpy.mockResolvedValueOnce(reply(204));
    await api.delete("admin/cohorts/c1");
    expect(fetchSpy.mock.calls[2][1].method).toBe("DELETE");
    expect(fetchSpy.mock.calls[2][1].body).toBeUndefined();
  });

  test("throws the product's error, and a 401 sends the person to sign in", async () => {
    fetchSpy.mockResolvedValueOnce(
      reply(403, { error: { code: "forbidden", message: "admins only" } })
    );
    const refused = (await api
      .get("admin/users")
      .catch((e: unknown) => e)) as ApiRequestError;
    expect(refused).toBeInstanceOf(ApiRequestError);
    expect(refused.error.code).toBe("forbidden");

    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const broken = (await api
      .get("admin/users")
      .catch((e: unknown) => e)) as ApiRequestError;
    expect(broken.error.code).toBe("unknown");

    const real = window.location;
    Object.defineProperty(window, "location", {
      value: { href: "/apps/beta-testers" },
      configurable: true,
    });
    fetchSpy.mockResolvedValueOnce(
      reply(401, { error: { code: "unauthorized", message: "expired" } })
    );
    await api.get("admin/users").catch(() => undefined);
    expect(window.location.href).toBe("/login");
    Object.defineProperty(window, "location", {
      value: real,
      configurable: true,
    });
  });
});
