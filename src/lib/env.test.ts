import { afterEach, expect, test, vi } from "vitest";
import { devToolsAllowed } from "./env";

afterEach(() => vi.unstubAllEnvs());

test("our own deployments get the simulator and the overlay", () => {
  for (const env of ["local", "dev", "e2e"])
    expect(devToolsAllowed(env)).toBe(true);
});

test("testers never do: beta, production and anything unrecognised fail closed", () => {
  for (const env of ["beta", "prod", "production", "", "Dev"])
    expect(devToolsAllowed(env)).toBe(false);
});

test("an unset variable is a laptop, unless the build is a production one", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(devToolsAllowed(undefined)).toBe(true);
  vi.stubEnv("NODE_ENV", "production");
  expect(devToolsAllowed(undefined)).toBe(false);
});
