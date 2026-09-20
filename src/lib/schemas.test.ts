import { describe, expect, test } from "vitest";
import {
  accountSchema,
  basicsSchema,
  profileSchema,
  toProfilePayload,
  toRegisterPayload,
} from "./schemas";

const validProfile = {
  full_name: "Ada Lovelace",
  birth_year: "1990",
  sex_at_birth: "female",
  handedness: "right" as const,
  native_languages: "it, en",
};

/** What registration actually sends: the four fields an EEG needs, and no others. */
const BASICS = basicsSchema.parse({
  full_name: "Ada Lovelace",
  birth_year: "1990",
  sex_at_birth: "female",
  handedness: "right",
});

describe("schemas", () => {
  test("account requires 10+ char password and valid email", () => {
    expect(
      accountSchema.safeParse({ email: "a@b.it", password: "short" }).success
    ).toBe(false);
    expect(
      accountSchema.safeParse({
        email: "not-an-email",
        password: "long-enough-pw",
      }).success
    ).toBe(false);
    expect(
      accountSchema.safeParse({ email: "a@b.it", password: "long-enough-pw" })
        .success
    ).toBe(true);
  });

  test("profile coerces numbers and validates handedness", () => {
    const parsed = profileSchema.parse(validProfile);
    expect(parsed.birth_year).toBe(1990);
    expect(
      profileSchema.safeParse({ ...validProfile, handedness: "both" }).success
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...validProfile, birth_year: "1850" }).success
    ).toBe(false);
  });

  test("profile payload: empty strings become null, languages split", () => {
    const payload = toProfilePayload(
      profileSchema.parse({ ...validProfile, gender: "", notes: "" })
    );
    expect(payload.gender).toBeNull();
    expect(payload.notes).toBeNull();
    expect(payload.native_languages).toEqual(["it", "en"]);
  });

  test("registration carries the account, the four basics, the consent and the opt-in", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      true,
      { wants_beta: true, intended_use: "patients", intended_use_other: "" },
      BASICS
    );
    expect(payload).toEqual({
      email: "a@b.it",
      password: "long-enough-pw",
      consent: true,
      profile: BASICS,
      wants_beta: true,
      intended_use: "patients",
      intended_use_other: null,
    });
  });

  test("the four basics are the only profile fields registration sends", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      true,
      { wants_beta: false, intended_use: "", intended_use_other: "" },
      BASICS
    );
    // Everything else - coffee, sleep, medications - belongs to the account page.
    expect(Object.keys(payload.profile).sort()).toEqual([
      "birth_year",
      "full_name",
      "handedness",
      "sex_at_birth",
    ]);
  });

  test("why someone wants in is dropped when they said no", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      true,
      { wants_beta: false, intended_use: "patients", intended_use_other: "" },
      BASICS
    );
    expect(payload.intended_use).toBeNull();
  });
});
