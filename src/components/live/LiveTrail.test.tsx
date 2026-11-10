import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test } from "vitest";
import it from "../../../messages/it.json";
import { IntlEn } from "@/i18n/testing";
import { LiveTrail } from "./LiveTrail";

afterEach(() => cleanup());

const final = { x: [0, 1, 2], y: [0, 1, 0] };

test("the tip is drawn dashed past the final points, and the caption says the lag", () => {
  const { container } = render(
    <IntlEn>
      <LiveTrail
        {...final}
        final={false}
        // windows 1 and 2 are final already; 3 and 4 are the tip
        tip={{ from: 1, x: [9, 9, 3, 4], y: [9, 9, 1, 2] }}
        lagMs={320}
      />
    </IntlEn>
  );
  // the final point, then 3 and 4: two dashed segments, none from the stale 9s
  expect(container.querySelectorAll("line[data-tip]")).toHaveLength(2);
  expect(container.querySelectorAll("line:not([data-tip])")).toHaveLength(2);
  expect(screen.getByText("live · 0.3 s behind")).toBeTruthy();
});

test("once the trail is final there is no tip, and the caption says so", () => {
  const { container } = render(
    <IntlEn>
      <LiveTrail
        {...final}
        final
        tip={{ from: 3, x: [3], y: [1] }}
        lagMs={300}
      />
    </IntlEn>
  );
  expect(container.querySelectorAll("line[data-tip]")).toHaveLength(0);
  expect(screen.getByText("final")).toBeTruthy();
});

test("the lag reads with the Italian decimal comma", () => {
  render(
    <NextIntlClientProvider locale="it" messages={it}>
      <LiveTrail {...final} final={false} tip={null} lagMs={1260} />
    </NextIntlClientProvider>
  );
  expect(screen.getByText("dal vivo · 1,3 s di ritardo")).toBeTruthy();
});
