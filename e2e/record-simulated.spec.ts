/**
 * The first end-to-end path (sprint S13): sign in, record 30 s with the simulated
 * headband, upload, and see the trail the worker computed.
 */
import { expect, test } from "@playwright/test";
import { approvedUser, PASSWORD } from "./support";

test("a simulated recording is uploaded and gets a trail", async ({
  page,
  request,
}) => {
  const email = await approvedUser(request);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");

  await page.goto("/record");
  await page.getByRole("button", { name: "Simulated", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connected")).toBeVisible();
  await page.getByLabel("Title").fill("e2e simulated session");
  await page.getByRole("button", { name: "Start recording" }).click();

  await page.waitForTimeout(30_000);
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Upload and analyze" }).click();

  await page.waitForURL("**/recordings/*");
  await expect(page.getByText("Trail", { exact: true })).toBeVisible({
    timeout: 150_000,
  });
});
