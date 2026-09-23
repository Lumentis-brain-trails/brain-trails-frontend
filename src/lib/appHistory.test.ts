import { beforeEach, expect, test } from "vitest";
import {
  hasInAppHistory,
  recordNavigation,
  resetNavigationHistory,
} from "./appHistory";

beforeEach(() => resetNavigationHistory());

test("a freshly loaded document has nothing of its own to go back to", () => {
  expect(hasInAppHistory()).toBe(false);
});

test("one in-app route change is enough to have somewhere to go back to", () => {
  recordNavigation();
  expect(hasInAppHistory()).toBe(true);
});

test("further route changes keep it true", () => {
  recordNavigation();
  recordNavigation();
  expect(hasInAppHistory()).toBe(true);
});
