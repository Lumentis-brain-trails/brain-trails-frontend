import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import en from "../../messages/en.json";
import it from "../../messages/it.json";
import {
  MIN_AGE_YEARS,
  PASSWORD_MIN_LENGTH,
  accountSchema,
  basicsSchema,
} from "./schemas";
import { describeValidation } from "./validationMessage";

type T = Parameters<typeof describeValidation>[0];

const translator = (locale: "en" | "it") =>
  createTranslator({
    locale,
    messages: locale === "en" ? en : it,
    namespace: "common.validation",
  }) as unknown as T;

const t = translator("en");

describe("describeValidation", () => {
  test("no error is no sentence", () => {
    expect(describeValidation(t, undefined)).toBeUndefined();
    expect(describeValidation(t, "")).toBeUndefined();
  });

  test("a key becomes its sentence, with the schema's own numbers in it", () => {
    expect(describeValidation(t, "email")).toBe(en.common.validation.email);
    expect(describeValidation(t, "passwordTooShort")).toBe(
      `At least ${PASSWORD_MIN_LENGTH} characters.`
    );
    expect(describeValidation(t, "minAge")).toBe(
      `Brain Trails is for people aged ${MIN_AGE_YEARS} and over.`
    );
  });

  test("the same key reads in the reader's language", () => {
    expect(describeValidation(translator("it"), "passwordTooShort")).toBe(
      `Almeno ${PASSWORD_MIN_LENGTH} caratteri.`
    );
  });

  test("anything that is not a key is shown as it came", () => {
    // zod's own English, from a schema that has not moved to keys
    const raw = "Too small: expected string to have >=2 characters";
    expect(describeValidation(t, raw)).toBe(raw);
    // a sentence a caller already translated, full stop and all
    expect(describeValidation(t, "Required for this profile.")).toBe(
      "Required for this profile."
    );
    // one bare word that is not in the catalogue
    expect(describeValidation(t, "nonsense")).toBe("nonsense");
  });

  test("what the sign-up forms report is what the person reads", () => {
    const account = accountSchema.safeParse({ email: "x", password: "short" });
    const basics = basicsSchema.safeParse({
      full_name: "",
      birth_year: "",
      sex_at_birth: "",
      handedness: "",
    });
    const sentences = [account, basics].flatMap((result) =>
      (result.error?.issues ?? []).map((issue) =>
        describeValidation(t, issue.message)
      )
    );
    expect(sentences).toEqual([
      "Invalid email address",
      "At least 10 characters.",
      "Enter your full name.",
      "Enter a valid year of birth.",
      "Choose an option.",
    ]);
  });
});
