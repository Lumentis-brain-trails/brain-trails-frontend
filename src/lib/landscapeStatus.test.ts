import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  LANDSCAPE_SEEN_KEY,
  isRedrawn,
  markEpochSeen,
  readSeenEpoch,
  subscribeSeenEpoch,
} from "./landscapeStatus";

const status = (epoch: number | null) => ({
  epoch,
  built_at: null,
  pending: false,
});

describe("isRedrawn", () => {
  test("no map, or its first drawing, is nothing to announce", () => {
    expect(isRedrawn(undefined, null)).toBe(false);
    expect(isRedrawn(status(null), null)).toBe(false);
    expect(isRedrawn(status(1), null)).toBe(false);
  });

  test("a later epoch than the one seen is", () => {
    expect(isRedrawn(status(2), null)).toBe(true);
    expect(isRedrawn(status(3), 2)).toBe(true);
    expect(isRedrawn(status(3), 3)).toBe(false);
  });
});

describe("the seen epoch", () => {
  beforeEach(() => window.localStorage.clear());

  test("is remembered and announced to subscribers", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSeenEpoch(onChange);
    expect(readSeenEpoch()).toBeNull();
    markEpochSeen(2);
    expect(readSeenEpoch()).toBe(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("never moves backwards", () => {
    markEpochSeen(3);
    markEpochSeen(2);
    expect(readSeenEpoch()).toBe(3);
  });

  test("ignores what it did not write", () => {
    window.localStorage.setItem(LANDSCAPE_SEEN_KEY, "soon");
    expect(readSeenEpoch()).toBeNull();
  });
});
