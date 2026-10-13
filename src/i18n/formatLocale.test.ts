import { expect, test } from "vitest";
import { regionalLocale } from "./formatLocale";

test("a flavour of the app's language is used for dates and numbers", () => {
  expect(regionalLocale("en", ["en-GB", "en"])).toBe("en-GB");
  expect(regionalLocale("it", ["de-CH", "it-CH", "it"])).toBe("it-CH");
  expect(regionalLocale("en", ["EN-us"])).toBe("EN-us");
});

test("a browser in another language follows the app's language", () => {
  expect(regionalLocale("en", ["it-IT", "it"])).toBe("en");
  expect(regionalLocale("it", ["en-GB", "en"])).toBe("it");
  expect(regionalLocale("it", [])).toBe("it");
});
