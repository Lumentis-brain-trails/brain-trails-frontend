import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { ConsentGate, needsConsentGate } from "./ConsentGate";

function renderGate(props: Parameters<typeof ConsentGate>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentGate {...props} />
    </NextIntlClientProvider>
  );
}

describe("ConsentGate", () => {
  afterEach(cleanup);

  test("shows the content warning and continues without a checkbox", () => {
    const onAccept = vi.fn();
    renderGate({
      manifest: {
        content_warning: "Flashing lights.",
        requires_consent: false,
        consent_text: null,
      },
      onAccept,
    });
    expect(screen.getByText("Flashing lights.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  test("requires the consent checkbox before continuing", () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    renderGate({
      manifest: {
        content_warning: null,
        requires_consent: true,
        consent_text: "Your data is used for research.",
      },
      title: "Study A",
      onAccept,
      onDecline,
    });
    expect(
      screen.getByRole("heading", { name: "Study A" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your data is used for research.")
    ).toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Continue" });
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  test("needsConsentGate is false only with nothing to show", () => {
    const none = {
      content_warning: null,
      requires_consent: false,
      consent_text: null,
    };
    expect(needsConsentGate(none)).toBe(false);
    expect(needsConsentGate({ ...none, content_warning: "x" })).toBe(true);
    expect(needsConsentGate({ ...none, requires_consent: true })).toBe(true);
  });
});
