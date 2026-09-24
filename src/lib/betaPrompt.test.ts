import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BETA_PROMPT_KEY, markBetaAsked, shouldAskBeta } from "./betaPrompt";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("shouldAskBeta", () => {
  test("asks someone who has not applied and was never asked", () => {
    expect(shouldAskBeta(false)).toBe(true);
  });

  test("never asks someone who already applied", () => {
    expect(shouldAskBeta(true)).toBe(false);
  });

  test("does not ask while the answer is unknown", () => {
    expect(shouldAskBeta(null)).toBe(false);
  });

  test("asks only once in a browser", () => {
    markBetaAsked();
    expect(window.localStorage.getItem(BETA_PROMPT_KEY)).not.toBeNull();
    expect(shouldAskBeta(false)).toBe(false);
  });

  test("does not ask when storage is blocked, since a 'not now' could not be kept", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(shouldAskBeta(false)).toBe(false);
  });

  test("marking survives blocked storage without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markBetaAsked()).not.toThrow();
  });
});
