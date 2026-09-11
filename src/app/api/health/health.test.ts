// @vitest-environment node
import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  test("answers ok for uptime probes", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });
});
