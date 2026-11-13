/**
 * The remote console end to end (plan V4 T5, "Done when"): a patient at home runs an
 * assigned protocol with the simulated headband; their carer, in another browser,
 * waits in the room, sees the headband check, watches the run - signal, plan, the trail
 * growing - takes the commands and sends a message the patient sees; a second carer
 * joins and watches.
 *
 * Needs the backend with `FEATURES` including `workspaces_multi,assignments,live,
 * console_remote`, a Redis (`REDIS_URL`), `PUBLIC_API_URL` set to the API's own URL,
 * and the worker running (its live consumer draws the trail; `EMBEDDER=fake` is fine).
 * Dev only: the simulated headband is never offered to testers (`lib/env.ts`).
 *
 * `E2E_RESTART_API`, when set, is a shell command that restarts the API (the live
 * gateway, in this stage) mid-run: the test then checks the console reconnects and the
 * trail keeps growing - "restarting the live service loses nothing".
 */
import { execSync } from "node:child_process";
import {
  type APIRequestContext,
  type Browser,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { API_URL, PASSWORD, approvedUser } from "./support";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-pass-123";

async function token(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const r = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  expect(r.status(), await r.text()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).access_token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function ok(
  response: Awaited<ReturnType<APIRequestContext["post"]>>
): Promise<Json> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

/** A practice with two carers, a patient with an account, and an assignment. */
async function clinic(request: APIRequestContext) {
  const admin = await token(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const [owner, second] = [
    await approvedUser(request),
    await approvedUser(request),
  ];
  const tom = await token(request, owner, PASSWORD);
  const tina = await token(request, second, PASSWORD);
  const workspace = await ok(
    await request.post(`${API_URL}/workspaces`, {
      headers: tom,
      data: { kind: "practice", name: `E2E ${Date.now()}` },
    })
  );
  await ok(
    await request.post(`${API_URL}/admin/workspaces/${workspace.id}/decide`, {
      headers: admin,
      data: { decision: "approve" },
    })
  );
  const invitation = await ok(
    await request.post(`${API_URL}/workspaces/${workspace.id}/invitations`, {
      headers: tom,
      data: { email: second },
    })
  );
  await ok(
    await request.post(`${API_URL}/invitations/accept`, {
      headers: tina,
      data: { token: invitation.link.split("token=")[1] },
    })
  );
  const subject = await ok(
    await request.post(`${API_URL}/workspaces/${workspace.id}/subjects`, {
      headers: tom,
      data: {
        display_name: "Maria Rossi",
        birth_year: 1980,
        handedness: "right",
        consent_version: "e2e",
        consent_attested: true,
      },
    })
  );
  // the second carer joins the care team, so both may watch
  const me = await (
    await request.get(`${API_URL}/auth/me`, { headers: tina })
  ).json();
  const added = await request.put(
    `${API_URL}/subjects/${subject.id}/carers/${me.id}`,
    {
      headers: tom,
    }
  );
  expect(added.ok(), await added.text()).toBe(true);
  const protocol = await ok(
    await request.post(`${API_URL}/protocols?workspace=${workspace.id}`, {
      headers: tom,
      data: {
        title: "Quiet rest",
        draft: {
          schema: 1,
          manifest: {},
          root: {
            type: "sequence",
            children: [
              {
                type: "block",
                id: "rest",
                kind: "rest",
                label: "Rest",
                config: { mode: "self_paced" },
              },
            ],
          },
        },
      },
    })
  );
  await ok(
    await request.post(`${API_URL}/protocols/${protocol.id}/publish`, {
      headers: tom,
    })
  );
  const patientEmail = `e2e-patient-${Date.now()}@example.com`;
  const link = await ok(
    await request.post(`${API_URL}/subjects/${subject.id}/invite`, {
      headers: tom,
      data: { email: patientEmail },
    })
  );
  await ok(
    await request.post(`${API_URL}/invitations/register`, {
      data: {
        token: link.link.split("token=")[1],
        password: PASSWORD,
        adult: true,
        consent: true,
      },
    })
  );
  const assignment = await ok(
    await request.post(`${API_URL}/workspaces/${workspace.id}/assignments`, {
      headers: tom,
      data: {
        subject_id: subject.id,
        protocol_id: protocol.id,
        runs_allowed: 3,
      },
    })
  );
  return { owner, second, patientEmail, subject, assignment, workspace };
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(home|my)/);
  return page;
}

test("a carer watches and steers a patient's run from elsewhere", async ({
  browser,
  request,
}) => {
  const world = await clinic(request);

  // the carer opens the waiting room from the patient's page
  const carer = await signIn(browser, world.owner);
  await carer.goto(`/patients/${world.subject.id}`);
  await carer.getByRole("link", { name: "Remote session" }).click();
  await expect(
    carer.getByText("Waiting for the patient to open the assignment.")
  ).toBeVisible();

  // the patient opens their Play: the carer is waiting there
  const patient = await signIn(browser, world.patientEmail);
  await patient.goto(`/my/run/${world.assignment.id}`);
  await expect(
    patient.getByText(/Your carer is in the waiting room/)
  ).toBeVisible();
  await patient.getByRole("radio", { name: "Simulated Muse 2" }).click();
  await patient.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(patient.getByText(/Connected to/)).toBeVisible();

  // both see the headband check
  await expect(carer.getByText("The patient is here.")).toBeVisible();
  await expect(carer.getByText(/Headband .* connected/)).toBeVisible();

  // the patient's Start moves the carer into the session's room
  const override = patient.getByLabel(/Start anyway/);
  if (await override.isVisible().catch(() => false)) await override.click();
  const started = Date.now();
  await patient.getByRole("button", { name: "Start session" }).click();
  await carer.waitForURL(/\/live\/[0-9a-f-]{36}$/);
  await expect(carer.getByText("Connected")).toBeVisible();
  await expect(carer.getByText("The run is going on")).toBeVisible();

  // the trail grows as the worker draws it
  await expect(
    carer.getByRole("img", { name: /The live trail, \d+ windows/ })
  ).toBeVisible({
    timeout: 60_000,
  });

  // the carer takes the commands and sends a message; the patient sees it
  await carer.getByRole("button", { name: "Take control" }).click();
  await expect(
    carer.getByRole("button", { name: "Let go of control" })
  ).toBeVisible();
  await carer
    .getByLabel("Message to the participant")
    .fill("Hello from your carer");
  const sentAt = Date.now();
  await carer.getByRole("button", { name: "Send" }).click();
  await expect(patient.getByText("Hello from your carer")).toBeVisible();
  const roundTrip = Date.now() - sentAt;
  await expect(carer.getByText("message: done")).toBeVisible();
  console.log(
    `message round trip ${roundTrip} ms, ${Date.now() - started} ms into the run`
  );

  // a pause waits for the block's end, and says so
  await carer.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(carer.getByText("pause: at the end of the block")).toBeVisible();
  await carer.getByRole("button", { name: "Resume" }).click();

  // a note, timed from the first keystroke
  await carer.getByLabel("Note", { exact: true }).fill("Restless at the start");
  await carer.getByRole("button", { name: "Save note" }).click();
  await expect(carer.getByText("1 note saved")).toBeVisible();

  // the live service restarts mid-run: the console reconnects, the trail goes on
  const trail = carer.getByRole("img", { name: /The live trail, \d+ windows/ });
  const windows = async () =>
    Number(
      (await trail.getAttribute("aria-label"))?.match(/(\d+) windows/)?.[1] ?? 0
    );
  if (process.env.E2E_RESTART_API) {
    const before = await windows();
    execSync(process.env.E2E_RESTART_API, { stdio: "inherit" });
    await expect(carer.getByText("Connected")).toBeVisible({ timeout: 60_000 });
    await expect.poll(windows, { timeout: 60_000 }).toBeGreaterThan(before + 3);
    // and the carer still holds the commands
    await expect(
      carer.getByRole("button", { name: "Let go of control" })
    ).toBeVisible();
  }

  // a second carer joins and watches; they cannot steer while the first holds control
  const second = await signIn(browser, world.second);
  await second.goto(carer.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(second.getByText("2 watching")).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Another carer has control" })
  ).toBeDisabled();

  // the patient finishes; both carers are told the run has ended
  await patient
    .getByRole("button", { name: /Finish/ })
    .first()
    .click();
  await expect(carer.getByText("The run has ended")).toBeVisible({
    timeout: 30_000,
  });
  await expect(second.getByText("The run has ended")).toBeVisible();
});
