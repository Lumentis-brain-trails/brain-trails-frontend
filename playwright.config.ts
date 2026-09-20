/**
 * End-to-end tests (plan V3, "Testing"): the real frontend against a real backend and
 * worker, with the simulated headband standing in for the Muse.
 *
 * Needs a running API (`E2E_API_URL`, default http://localhost:8000) with the worker and
 * `EMBEDDER=fake`, and an admin account (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`) to
 * approve the users the tests register. The frontend is started here unless one is
 * already listening on port 3000. See docs/E2E.md.
 */
import { defineConfig, devices } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "e2e",
  // A recording goes through the worker's pipeline before its trail exists.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      API_URL,
      COOKIE_SECURE: "false",
      NEXT_PUBLIC_APP_ENV: "e2e",
    },
  },
});
