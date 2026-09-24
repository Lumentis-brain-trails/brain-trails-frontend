import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { BETA_PROMPT_KEY } from "@/lib/betaPrompt";
import { BetaPrompt } from "./BetaPrompt";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** IntersectionObserver stub: `reachEnd()` reports the marker as scrolled into view. */
let observed: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
function reachEnd() {
  act(() => observed?.([{ isIntersecting: true }]));
}

function renderPrompt(wantsBeta: boolean | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BetaPrompt wantsBeta={wantsBeta} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  push.mockClear();
  observed = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof observed) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BetaPrompt", () => {
  test("asks at the end of the report, once it has been on screen long enough", () => {
    renderPrompt(false);
    reachEnd();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.localStorage.getItem(BETA_PROMPT_KEY)).not.toBeNull();
  });

  test("does not ask before the end of the report is reached", () => {
    renderPrompt(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("never asks someone who already applied, or whose answer is unknown", () => {
    for (const wantsBeta of [true, null]) {
      renderPrompt(wantsBeta);
      reachEnd();
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      cleanup();
    }
  });

  test("asks only once in a browser", () => {
    window.localStorage.setItem(BETA_PROMPT_KEY, "2026-09-23T00:00:00Z");
    renderPrompt(false);
    reachEnd();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("applying opens the account page on the application form", () => {
    renderPrompt(false);
    reachEnd();
    act(() => vi.advanceTimersByTime(15_000));
    fireEvent.click(
      screen.getByRole("button", { name: "Apply for beta testing" })
    );
    expect(push).toHaveBeenCalledWith("/account#apply-beta");
  });

  test("not now closes it", () => {
    renderPrompt(false);
    reachEnd();
    act(() => vi.advanceTimersByTime(15_000));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
