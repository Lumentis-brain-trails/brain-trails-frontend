import { describe, expect, test } from "vitest";
import { accountSchema, profileSchema, toRegisterPayload } from "./schemas";

const validProfile = {
  full_name: "Ada Lovelace",
  birth_year: "1990",
  sex_at_birth: "female",
  handedness: "right" as const,
  native_languages: "it, en",
};

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

  test("payload conversion: empty strings become null, languages split", () => {
    const payload = toRegisterPayload(
      { email: "a@b.it", password: "long-enough-pw" },
      profileSchema.parse({ ...validProfile, gender: "", notes: "" }),
      true
    );
    expect(payload.profile.gender).toBeNull();
    expect(payload.profile.notes).toBeNull();
    expect(payload.profile.native_languages).toEqual(["it", "en"]);
    expect(payload.consent).toBe(true);
  });
});
