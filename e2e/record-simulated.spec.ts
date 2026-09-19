/**
 * The first end-to-end path (sprints S13, S18): sign in, play the official Free
 * recording protocol with the simulated headband, upload, and see the trail the worker
 * computed. Free recording is a protocol like any other now, so this also covers the
 * catalog, the session's resolved plan and the capture upload.
 */
import { expect, test } from "@playwright/test";
import { approvedUser, PASSWORD } from "./support";

test("a simulated session is uploaded and gets a trail", async ({
  page,
  request,
}) => {
  const email = await approvedUser(request);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");

  await page.goto("/protocols");
  await page
    .getByRole("link", { name: /Free recording/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Play", exact: true }).click();

  await page.getByRole("button", { name: "Simulated", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/Connected to/)).toBeVisible();
  const override = page.getByLabel(/Start anyway/);
  if (await override.isVisible().catch(() => false)) await override.click();
  await page.getByRole("button", { name: "Start session" }).click();

  await page.waitForTimeout(30_000);
  await page
    .getByRole("button", { name: /Finish/ })
    .first()
    .click();

  await expect(
    page.getByRole("button", { name: /Open the recording/ })
  ).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("button", { name: /Open the recording/ }).click();
  await page.waitForURL("**/recordings/*");
  await expect(page.getByText("Trail", { exact: true })).toBeVisible({
    timeout: 150_000,
  });
});
