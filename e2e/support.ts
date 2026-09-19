/**
 * Helpers that talk to the backend directly, to put the world in the state a test
 * needs (an approved account) without clicking through the admin screens each time.
 */
import { expect, type APIRequestContext } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin-pass-123";

export const PASSWORD = "e2e-pass-12345";

const PROFILE = {
  full_name: "E2E Participant",
  birth_year: 1990,
  sex_at_birth: "female",
  handedness: "right",
};

/** Register a fresh user, approve it as the admin, and return its email. */
export async function approvedUser(
  request: APIRequestContext
): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const registered = await request.post(`${API_URL}/auth/register`, {
    data: { email, password: PASSWORD, consent: true, profile: PROFILE },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const { id } = await registered.json();

  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.status(), "admin login (see docs/E2E.md)").toBe(200);
  const { access_token } = await login.json();
  const approved = await request.post(
    `${API_URL}/admin/registrations/${id}/approve`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  expect(approved.status(), await approved.text()).toBe(200);
  return email;
}
