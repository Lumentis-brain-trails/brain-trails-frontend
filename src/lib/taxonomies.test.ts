import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import en from "../../messages/en.json";
import it from "../../messages/it.json";
import { optionLabel } from "./taxonomies";

type T = Parameters<typeof optionLabel>[0];

const english = createTranslator({
  locale: "en",
  messages: en,
  namespace: "taxonomies",
}) as unknown as T;
const italian = createTranslator({
  locale: "it",
  messages: it,
  namespace: "taxonomies",
}) as unknown as T;

describe("optionLabel", () => {
  test("a known code reads in the translator's language", () => {
    expect(optionLabel(english, "prefer_not_to_say")).toBe("Prefer not to say");
    expect(optionLabel(italian, "bachelor")).toBe("Laurea triennale");
  });

  test("sex at birth and gender keep their own words", () => {
    expect(optionLabel(italian, "female")).toBe("Femmina");
    expect(optionLabel(italian, "woman")).toBe("Donna");
  });

  test("a list may refine a shared code, and English does not", () => {
    expect(optionLabel(italian, "none", "alcohol_use")).toBe("Mai");
    expect(optionLabel(italian, "none", "vision_correction")).toBe("Nessuna");
    expect(optionLabel(english, "none", "alcohol_use")).toBe("None");
  });

  test("a list with no refinement uses the code's general words", () => {
    expect(optionLabel(italian, "other", "gender")).toBe("Altro");
    expect(optionLabel(italian, "none", "a_list_from_tomorrow")).toBe(
      optionLabel(italian, "none")
    );
  });

  test("a code the catalogue has no words for is opened up, not left empty", () => {
    expect(optionLabel(english, "shift_work")).toBe("shift work");
    expect(optionLabel(italian, "shift_work", "occupation")).toBe("shift work");
  });
});

describe("the catalogues", () => {
  test("Italian has words for every option English has", () => {
    expect(Object.keys(it.taxonomies.option).sort()).toEqual(
      Object.keys(en.taxonomies.option).sort()
    );
  });
});
