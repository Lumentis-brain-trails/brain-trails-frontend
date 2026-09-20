// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const loginRequest = () =>
  new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.it", password: "pw-long-enough" }),
    headers: { "Content-Type": "application/json" },
  });

describe("auth routes", () => {
  test("login stores the JWT in an httpOnly cookie and never returns it", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "jwt-abc" }), { status: 200 })
    );
    const res = await login(loginRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    const cookie = res.cookies.get("bt_token");
    expect(cookie?.value).toBe("jwt-abc");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  test("login relays backend errors and sets no cookie", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "account_pending", message: "wait" } }),
        { status: 403 }
      )
    );
    const res = await login(loginRequest());
    expect(res.status).toBe(403);
    expect(res.cookies.get("bt_token")).toBeUndefined();
    expect((await res.json()).error.code).toBe("account_pending");
  });

  test("logout clears the cookie", async () => {
    const res = await logout();
    const cookie = res.cookies.get("bt_token");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
