import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { ApplicationStep } from "./ApplicationStep";

afterEach(() => cleanup());

function renderStep(onDone = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ApplicationStep initial={null} onBack={vi.fn()} onDone={onDone} />
    </NextIntlClientProvider>
  );
  return onDone;
}

const a = messages.application;

test("a private applicant goes through with the detected environment", async () => {
  const onDone = renderStep();
  fireEvent.click(screen.getByRole("button", { name: a.continue }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  const values = onDone.mock.calls[0][0];
  expect(values.requested_profile).toBe("private");
  expect(values.browser).toBeTruthy();
  // jsdom has no Web Bluetooth: the applicant is told, and may still apply
  expect(screen.getByTestId("bluetooth-support").textContent).toBe(
    a.bluetooth_missing
  );
});

test("a therapist is asked for a registration number before continuing", async () => {
  const onDone = renderStep();
  fireEvent.change(screen.getByLabelText(a.profile.label), {
    target: { value: "therapist" },
  });
  expect(
    await screen.findByLabelText(a.registration_no, { exact: false })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: a.continue }));
  expect(await screen.findByText(a.required)).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(a.registration_no, { exact: false }), {
    target: { value: "RM-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: a.continue }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test("a lab member names both the institution and a supervisor", async () => {
  renderStep();
  fireEvent.change(screen.getByLabelText(a.profile.label), {
    target: { value: "lab_member" },
  });
  expect(await screen.findByLabelText(a.institution)).toBeTruthy();
  expect(screen.getByLabelText(a.supervisor)).toBeTruthy();
  expect(
    screen.queryByLabelText(a.registration_no, { exact: false })
  ).toBeNull();
});
