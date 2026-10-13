import { afterEach, expect, test } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_NAMES,
  fromAcceptLanguage,
  isLocale,
  resolveLocale,
  setLocale,
} from "./locales";

afterEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
});

test("the fallback is a supported locale, and every locale has a name", () => {
  expect(LOCALES).toContain(DEFAULT_LOCALE);
  for (const locale of LOCALES) expect(LOCALE_NAMES[locale]).toBeTruthy();
});

test("isLocale accepts only the supported codes", () => {
  expect(isLocale("it")).toBe(true);
  expect(isLocale("en")).toBe(true);
  expect(isLocale("fr")).toBe(false);
  expect(isLocale("IT")).toBe(false);
  expect(isLocale(undefined)).toBe(false);
});

test("Accept-Language is read by weight, then by the reader's order", () => {
  expect(fromAcceptLanguage("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
  expect(fromAcceptLanguage("en-GB,en;q=0.9,it;q=0.8")).toBe("en");
  expect(fromAcceptLanguage("fr;q=0.9, it;q=0.4, en;q=0.6")).toBe("en");
  expect(fromAcceptLanguage("it, en")).toBe("it");
});

test("a regional tag matches on its language", () => {
  expect(fromAcceptLanguage("it-CH")).toBe("it");
  expect(fromAcceptLanguage("EN-us")).toBe("en");
});

test("an unsupported, refused or unreadable header picks nothing", () => {
  expect(fromAcceptLanguage("fr-FR,de;q=0.8")).toBeNull();
  expect(fromAcceptLanguage("it;q=0, fr")).toBeNull();
  expect(fromAcceptLanguage("it;q=abc")).toBeNull();
  expect(fromAcceptLanguage("*")).toBeNull();
  expect(fromAcceptLanguage("")).toBeNull();
  expect(fromAcceptLanguage(null)).toBeNull();
});

test("an explicit choice wins over the browser's languages", () => {
  expect(resolveLocale("it", "en-GB,en")).toBe("it");
  expect(resolveLocale("en", "it-IT,it")).toBe("en");
});

test("without a valid choice the browser decides, then English", () => {
  expect(resolveLocale(undefined, "it-IT,it;q=0.9")).toBe("it");
  expect(resolveLocale("klingon", "it")).toBe("it");
  expect(resolveLocale(undefined, "fr")).toBe("en");
  expect(resolveLocale(null, null)).toBe("en");
});

test("setLocale writes the cookie the server reads", () => {
  setLocale("it");
  expect(document.cookie).toContain(`${LOCALE_COOKIE}=it`);
  setLocale("en");
  expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
  expect(document.cookie).not.toContain(`${LOCALE_COOKIE}=it`);
});
