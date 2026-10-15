import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { IntlEn } from "@/i18n/testing";
import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

test("a recording status reads from recordings.status", () => {
  render(<StatusBadge status="done" />, { wrapper: IntlEn });
  expect(screen.getByText("Ready")).toBeTruthy();
});

test("an account status reads from admin.statuses", () => {
  render(<StatusBadge status="approved" />, { wrapper: IntlEn });
  expect(screen.getByText("Approved")).toBeTruthy();
});

test("a status with both meanings keeps the recording's word", () => {
  // `failed` is a job status; `rejected` and `pending` only exist for accounts.
  render(
    <>
      <StatusBadge status="failed" />
      <StatusBadge status="pending" />
    </>,
    { wrapper: IntlEn }
  );
  expect(screen.getByText("Failed")).toBeTruthy();
  expect(screen.getByText("Pending")).toBeTruthy();
});

test("a status nobody has heard of is shown as stored", () => {
  render(<StatusBadge status="quarantined" />, { wrapper: IntlEn });
  expect(screen.getByText("quarantined")).toBeTruthy();
});
