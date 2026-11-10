import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test } from "vitest";
import it from "../../../messages/it.json";
import { IntlEn } from "@/i18n/testing";
import { LiveTrail } from "./LiveTrail";

afterEach(() => cleanup());

const trail = { x: [0, 1, 2, 3], y: [0, 1, 0, 1] };

test("a continuous curve through every point, and the caption says the lag", () => {
  const { container } = render(
    <IntlEn>
      <LiveTrail {...trail} final={false} lagMs={320} />
    </IntlEn>
  );
  const segments = container.querySelectorAll("path");
  expect(segments).toHaveLength(3);
  // curves, not straight lines
  for (const segment of segments)
    expect(segment.getAttribute("d")).toMatch(/^M [\d.]+ [\d.]+ C /);
  expect(screen.getByText("live · 0.3 s behind")).toBeTruthy();
});

test("once the trail is final the caption says so", () => {
  render(
    <IntlEn>
      <LiveTrail {...trail} final lagMs={300} />
    </IntlEn>
  );
  expect(screen.getByText("final")).toBeTruthy();
});

test("the compact view over a run has no caption and no empty text", () => {
  const { container } = render(
    <IntlEn>
      <LiveTrail x={[1]} y={[1]} final={false} compact />
    </IntlEn>
  );
  expect(container.textContent).toBe("");
});

test("the lag reads with the Italian decimal comma", () => {
  render(
    <NextIntlClientProvider locale="it" messages={it}>
      <LiveTrail {...trail} final={false} lagMs={1260} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText("dal vivo · 1,3 s di ritardo")).toBeTruthy();
});
