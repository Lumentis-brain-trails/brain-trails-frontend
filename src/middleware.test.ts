// @vitest-environment node
import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

describe("middleware", () => {
  test("redirects anonymous visitors to /login with the origin path", () => {
    const res = middleware(new NextRequest("http://localhost/recordings/abc"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/recordings/abc");
  });

  test("lets sessions through", () => {
    const req = new NextRequest("http://localhost/admin", {
      headers: { cookie: "bt_token=x" },
    });
    expect(middleware(req).status).toBe(200);
  });

  test("guards only the authenticated areas", () => {
    expect(config.matcher).toEqual([
      "/recordings/:path*",
      "/record",
      "/admin/:path*",
    ]);
  });
});
