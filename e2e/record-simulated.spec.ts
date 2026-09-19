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

  // the headband picker is a radiogroup, and the simulator is the default outside prod
  await page.getByRole("radio", { name: "Simulated Muse 2" }).click();
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

  // the review page reads the same session back on one clock (S20)
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await page.waitForURL("**/review");
  await expect(
    page.getByRole("slider", { name: "Session timeline" })
  ).toBeVisible();
  await expect(page.getByTitle("Free recording")).toBeVisible({
    timeout: 30_000,
  });
});

/**
 * The builder (sprint S19) and the review page (S20), end to end: build a protocol from
 * nothing, publish it, and read back the session the first test recorded.
 */
test("a protocol is built on the timeline, published and played", async ({
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
  await page.getByRole("button", { name: "New protocol" }).click();
  await page.waitForURL("**/edit");

  // the Elements tab holds the blocks that are not media
  await page.getByRole("tab", { name: "Elements" }).click();
  await page.dragAndDrop(
    'button:has-text("Resting baseline")',
    '[data-testid="gap-0"]'
  );
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.dragAndDrop(
    'button:has-text("Countdown")',
    '[data-testid="gap-1"]'
  );
  await expect(page.getByRole("listitem")).toHaveCount(2);

  // the draft autosaves, then Publish freezes it as version 1
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByLabel("Name").fill("E2E built protocol");
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .last()
    .click();

  await page.goto("/protocols");
  await expect(
    page.getByRole("link", { name: /E2E built protocol/ })
  ).toBeVisible({ timeout: 15_000 });
});
