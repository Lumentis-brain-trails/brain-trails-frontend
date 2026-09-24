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
  // the recording opens on the comparison view: two blocks of the run, side by side
  const left = page.getByRole("combobox", { name: "Left block" });
  await expect(left).toBeVisible({ timeout: 150_000 });
  await expect(
    page.getByRole("combobox", { name: "Right block" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Brain trail" }).first()
  ).toBeVisible();

  // the old review address lands on the same page
  const recording = page.url();
  await page.goto(`${recording}/review`);
  await page.waitForURL(recording);
  await expect(left).toBeVisible({ timeout: 30_000 });
});

/**
 * The builder (sprint S19), end to end: build a protocol from nothing and publish it.
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
  // dropped on the strip itself, which is the gesture a person makes on an empty
  // timeline (Alessio, 2026-09-20)
  await page.dragAndDrop(
    'button:has-text("Resting baseline")',
    '[data-testid="timeline"]'
  );
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.dragAndDrop(
    'button:has-text("Countdown")',
    '[data-testid="timeline"]',
    { targetPosition: { x: 400, y: 40 } }
  );
  await expect(page.getByRole("listitem")).toHaveCount(2);

  // the draft autosaves, then Publish freezes it as version 1
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 15_000 });
  // the inspector has fields of its own, so the dialog's are addressed inside it
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("E2E built protocol");
  await dialog.getByRole("button", { name: /^Publish/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await page.goto("/protocols");
  await expect(
    page.getByRole("link", { name: /E2E built protocol/ })
  ).toBeVisible({ timeout: 15_000 });
});
