import { describe, expect, test } from "vitest";
import {
  accountSchema,
  basicsSchema,
  MIN_AGE_YEARS,
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

  test("registration carries the account, the four basics and both consents", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      { core: true, research: false, newsletter: false },
      BASICS
    );
    expect(payload).toEqual({
      email: "a@b.it",
      password: "long-enough-pw",
      consent: true,
      research_consent: false,
      newsletter: false,
      profile: BASICS,
      // Not asked outside a fair, and the API ignores it when the stand is closed.
      wants_device_test: false,
      // Not asked at sign-up any more: false is "not asked yet", set after a protocol.
      wants_beta: false,
    });
  });

  test("the four basics are the only profile fields registration sends", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      { core: true, research: false, newsletter: false },
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

  test("the fair tick is carried only when it was ticked", () => {
    const call = (wants: boolean) =>
      toRegisterPayload(
        { email: "a@b.it", password: "long-enough-pw" },
        { core: true, research: false, newsletter: false },
        BASICS,
        wants
      );
    expect(call(false).wants_device_test).toBe(false);
    expect(call(true).wants_device_test).toBe(true);
  });

  test("the newsletter is carried on its own, and never inferred from a consent", () => {
    const call = (newsletter: boolean) =>
      toRegisterPayload(
        { email: "a@b.it", password: "long-enough-pw" },
        { core: true, research: false, newsletter },
        BASICS
      );
    expect(call(false).newsletter).toBe(false);
    expect(call(true).newsletter).toBe(true);
    // Wanting our emails says nothing about agreeing to research, or the other way round.
    expect(call(true).research_consent).toBe(false);
  });

  test("the optional research consent is carried, and is off unless it was ticked", () => {
    const call = (research: boolean) =>
      toRegisterPayload(
        { email: "a@b.it", password: "long-enough-pw" },
        { core: true, research, newsletter: false },
        BASICS
      );
    expect(call(false).research_consent).toBe(false);
    expect(call(true).research_consent).toBe(true);
    // The required one is never inferred from the optional one, in either direction.
    expect(call(true).consent).toBe(true);
  });

  test("an unanswered sex at birth is sent as null, not an empty string", () => {
    const basics = basicsSchema.parse({
      full_name: "Ada Lovelace",
      birth_year: "1990",
      sex_at_birth: "",
      handedness: "right",
    });
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      { core: true, research: false, newsletter: false },
      basics
    );
    expect(payload.profile.sex_at_birth).toBeNull();
  });

  test("an account is not opened for someone under the age floor", () => {
    const tooYoung = {
      full_name: "Ada Lovelace",
      birth_year: String(new Date().getFullYear() - 10),
      sex_at_birth: "female",
      handedness: "right",
    };
    expect(basicsSchema.safeParse(tooYoung).success).toBe(false);
    expect(
      basicsSchema.safeParse({
        ...tooYoung,
        birth_year: String(new Date().getFullYear() - MIN_AGE_YEARS),
      }).success
    ).toBe(true);
  });
});
