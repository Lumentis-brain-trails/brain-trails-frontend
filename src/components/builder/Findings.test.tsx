import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import type { Finding } from "@/lib/builder/findings";
import { IntlEn } from "@/i18n/testing";
import { FindingsList } from "./Findings";

afterEach(cleanup);

/** One finding the builder made (it carries its sentence's key) and one from the server. */
const OWN: Finding = {
  rule: "config",
  path: "root/0/config/lines/1/text",
  message: '"text" cannot be empty.',
  text: { key: "empty", values: { name: "text" } },
};
const SERVER: Finding = {
  rule: "media",
  path: "root/1",
  message: "The video is longer than the block allows.",
};

test("a finding names its block and says what is wrong, and selects the block", () => {
  const onLocate = vi.fn();
  render(
    <IntlEn>
      <FindingsList
        errors={[OWN]}
        warnings={[SERVER]}
        labels={["Welcome", "Film"]}
        onLocate={onLocate}
      />
    </IntlEn>
  );
  expect(screen.getByText('"text" cannot be empty.')).toBeInTheDocument();
  expect(
    screen.getByText("The video is longer than the block allows.")
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Block 1: Welcome · row 2 · Lines · Text",
    })
  );
  expect(onLocate).toHaveBeenCalledWith(0);
});

test("the builder's own findings read in the reader's language, the server's as they arrive", () => {
  render(
    <NextIntlClientProvider locale="it" messages={it as unknown as typeof en}>
      <FindingsList errors={[OWN, SERVER]} labels={["Welcome", "Film"]} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('"text" non può essere vuoto.')).toBeInTheDocument();
  expect(screen.queryByText('"text" cannot be empty.')).toBeNull();
  expect(
    screen.getByText("The video is longer than the block allows.")
  ).toBeInTheDocument();
});
