import { describe, expect, test } from "vitest";
import { countries, languages } from "./regions";

const nameOf = (list: { code: string; name: string }[], code: string) =>
  list.find((entry) => entry.code === code)?.name;

describe("countries", () => {
  test("are named in the locale passed, not the runtime's", () => {
    expect(nameOf(countries("en"), "DE")).toBe("Germany");
    expect(nameOf(countries("it"), "DE")).toBe("Germania");
  });

  test("are sorted by the name the reader sees", () => {
    const names = countries("it").map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "it")));
    // "Spain" sits before "Sri Lanka" in English; "Spagna" has to move with its name.
    expect(names.indexOf("Spagna")).toBeGreaterThan(names.indexOf("Somalia"));
  });

  test("keep every code whatever the language", () => {
    expect(
      countries("it")
        .map((entry) => entry.code)
        .sort()
    ).toEqual(
      countries("en")
        .map((entry) => entry.code)
        .sort()
    );
  });
});

describe("languages", () => {
  test("are named in the locale passed", () => {
    expect(nameOf(languages("en"), "it")).toBe("Italian");
  });

  test("start with a capital in a menu, which Italian does not do mid-sentence", () => {
    expect(nameOf(languages("it"), "en")).toBe("Inglese");
    expect(nameOf(languages("it"), "it")).toBe("Italiano");
  });
});
