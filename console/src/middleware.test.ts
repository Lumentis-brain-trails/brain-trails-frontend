// @vitest-environment node
import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
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

  test("a call with an access token and no cookie reaches the BFF, not the sign-in", () => {
    // OPS-0005: a working session sends `Authorization: Bearer btc_...` to
    // /api/ops/documents with no cookie; the middleware never runs there.
    const matches = (url: string) =>
      unstable_doesMiddlewareMatch({
        config,
        url,
        headers: { authorization: "Bearer btc_x" },
      });
    expect(matches("http://c/api/ops/documents")).toBe(false);
    expect(matches("http://c/api/ops/documents/roadmap-report")).toBe(false);
    expect(matches("http://c/apps/documents")).toBe(true);
  });
});
