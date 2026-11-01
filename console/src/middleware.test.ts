// @vitest-environment node
import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

describe("console middleware", () => {
  test("sends a visitor without a console session to the sign-in, with where they were going", () => {
    const res = middleware(new NextRequest("http://c/apps/worklog"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/apps/worklog");
    const home = new URL(
      middleware(new NextRequest("http://c/")).headers.get("location")!
    );
    expect(home.searchParams.has("from")).toBe(false);
  });

  test("lets a session cookie through; bt-ops decides the rest", () => {
    const req = new NextRequest("http://c/", {
      headers: { cookie: "bto_session=x" },
    });
    expect(middleware(req).status).toBe(200);
  });

  test("guards the shell, never the sign-in or the BFF", () => {
    expect(config.matcher).toEqual(["/", "/apps/:path*"]);
  });
});
