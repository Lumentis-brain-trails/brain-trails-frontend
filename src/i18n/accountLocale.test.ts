import { afterEach, expect, test } from "vitest";
import {
  CHOSEN_HERE_KEY,
  reconcileLocale,
  rememberChosenHere,
  takeChosenHere,
} from "./accountLocale";

afterEach(() => window.sessionStorage.clear());

test("browser and account in agreement need nothing", () => {
  expect(reconcileLocale("it", "it", null)).toBeNull();
  expect(reconcileLocale("it", "it", "it")).toBeNull();
});

test("a choice made elsewhere arrives on this browser", () => {
  expect(reconcileLocale("en", "it", null)).toEqual({ adopt: "it" });
  expect(reconcileLocale("it", "en", null)).toEqual({ adopt: "en" });
});

test("a language picked here just before signing in is stored on the account", () => {
  expect(reconcileLocale("it", "en", "it")).toEqual({ store: "it" });
  expect(reconcileLocale("it", null, "it")).toEqual({ store: "it" });
});

test("an account that never chose takes the language its owner is reading", () => {
  expect(reconcileLocale("it", null, null)).toEqual({ store: "it" });
  expect(reconcileLocale("en", undefined, null)).toEqual({ store: "en" });
});

test("a language the app does not speak is ignored, wherever it comes from", () => {
  expect(reconcileLocale("en", "fr", null)).toEqual({ store: "en" });
  expect(reconcileLocale("en", "it", "fr")).toEqual({ adopt: "it" });
});

test("the signed-out choice is read once", () => {
  rememberChosenHere("it");
  expect(window.sessionStorage.getItem(CHOSEN_HERE_KEY)).toBe("it");
  expect(takeChosenHere()).toBe("it");
  expect(takeChosenHere()).toBeNull();
});
