/** Zod schemas mirroring the backend contracts (app/schemas.py). */
import { z } from "zod";

const optional = (max: number) =>
  z.string().max(max).optional().or(z.literal(""));

/**
 * The age floor for an account (V3-0011), mirroring `MIN_AGE_YEARS` in app/schemas.py.
 *
 * Only a year is collected, so the check is coarse at the boundary. Sharpening it would
 * mean asking for a birthdate, which is more personal data to guard the wrong way round.
 */
export const MIN_AGE_YEARS = 18;

/** The bounds of a password, mirroring `RegisterIn` in app/schemas.py. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * What a form can be told is wrong with an answer, as keys of `common.validation` in the
 * message catalogue.
 *
 * A schema has no locale, so it cannot carry a sentence: the issue's `message` is one of
 * these keys and the form turns it into words where the error is shown
 * (`useValidationMessage` in `@/lib/validationMessage`). `schemas.test.ts` holds every
 * key here to the catalogue, and every issue of the keyed schemas to this list.
 */
export const VALIDATION_KEYS = [
  "email",
  "passwordTooShort",
  "passwordTooLong",
  "fullName",
  "birthYear",
  "choose",
  "minAge",
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];

/** Spells a key where zod takes any string, so a typo is a compile error. */
const key = (name: ValidationKey): string => name;

/**
 * The three profile fields a form validates visibly, each written once.
 *
 * Every way the field can fail reports the same catalogue key: the person needs to know
 * what to type, not which of zod's checks tripped.
 */
const fullName = (message: ValidationKey) =>
  z.string(message).min(2, message).max(200, message);
const birthYear = (message: ValidationKey) =>
  z.coerce.number(message).int(message).min(1900, message).max(2100, message);
const handedness = (message: ValidationKey) =>
  z.enum(["left", "right", "ambidextrous"], message);
const sexAtBirth = z.string().max(30).optional().or(z.literal(""));

/**
 * The profile, as the account page sends it back (`PUT /auth/me/profile`).
 *
 * Registration no longer asks for any of this (V3-0008, amended): the four required
 * fields are what an EEG recording needs to be interpretable, and the backend asks for
 * them before a first session rather than at the door. The `_other` companions carry the
 * long tail of the closed lists; the lists themselves come from `GET /taxonomies`, so
 * nothing here enumerates their options.
 */
export const profileSchema = z.object({
  full_name: fullName("fullName"),
  birth_year: birthYear("birthYear"),
  sex_at_birth: sexAtBirth,
  handedness: handedness("choose"),
  gender: optional(50),
  gender_other: optional(50),
  education_level: optional(100),
  education_level_other: optional(100),
  occupation: optional(200),
  occupation_other: optional(200),
  native_languages: z.string().optional(), // comma-separated in the form
  musical_training_years: z.coerce.number().int().min(0).max(100).optional(),
  meditation_practice: optional(100),
  caffeine_cups_per_day: z.coerce.number().int().min(0).max(50).optional(),
  nicotine_use: optional(100),
  alcohol_use: optional(100),
  medications: z.string().optional().or(z.literal("")),
  neurological_conditions: z.string().optional().or(z.literal("")),
  psychiatric_conditions: z.string().optional().or(z.literal("")),
  avg_sleep_hours: z.coerce.number().min(0).max(24).optional(),
  vision_correction: optional(100),
  hearing_issues: optional(200),
  hearing_issues_other: optional(200),
  notes: z.string().optional().or(z.literal("")),
});

/** Sign-in and the first step of registration; every failure is a `ValidationKey`. */
export const accountSchema = z.object({
  email: z.string(key("email")).email(key("email")),
  password: z
    .string(key("passwordTooShort"))
    .min(PASSWORD_MIN_LENGTH, key("passwordTooShort"))
    .max(PASSWORD_MAX_LENGTH, key("passwordTooLong")),
});

/**
 * The four answers registration does ask for.
 *
 * Not a compromise between "everything" and "nothing": these are exactly the fields an
 * EEG recording cannot be interpreted without, which is why the backend refuses a
 * session until they exist (422 `profile_required`). Asking them at the door costs four
 * short fields and saves the person being stopped later with the headband already on.
 * Everything else - coffee, sleep, medications, the beta credentials - stays on the
 * account page, where nobody is waiting behind you.
 *
 * The same rules as the profile's own four fields, reported as `ValidationKey`s: this is
 * the form a person who reads no English fills in first.
 */
export const basicsSchema = z
  .object({
    full_name: fullName("fullName"),
    birth_year: birthYear("birthYear"),
    sex_at_birth: sexAtBirth,
    handedness: handedness("choose"),
  })
  .refine((v) => new Date().getFullYear() - v.birth_year >= MIN_AGE_YEARS, {
    path: ["birth_year"],
    message: key("minAge"),
  });

export type ProfileForm = z.output<typeof profileSchema>;
export type ProfileFormInput = z.input<typeof profileSchema>;
export type AccountForm = z.output<typeof accountSchema>;
export type BasicsForm = z.output<typeof basicsSchema>;

/** An empty string means "not answered", which the API spells `null`. */
const clean = (v: string | undefined) =>
  v === "" || v === undefined ? null : v;

/**
 * Registration: the account, who you are in four fields, the consent.
 *
 * The rest of the profile and all of the beta credentials are written later from the
 * account page, so a queue at a stand keeps moving. Whether someone wants to be a beta
 * tester is not asked here either: it is asked once they have tried a protocol and know
 * what they would be testing, so `wants_beta` goes out as false - "not asked yet" - and
 * is set from there.
 */
export function toRegisterPayload(
  account: AccountForm,
  consent: { core: boolean; research: boolean; newsletter: boolean },
  basics: BasicsForm,
  wantsDeviceTest = false
) {
  return {
    email: account.email,
    password: account.password,
    // `consent` is the required one and keeps the name the API has always used for it;
    // `research_consent` is the separate optional question (V3-0011).
    consent: consent.core,
    research_consent: consent.research,
    // A mailing list, not a consent: it carries no version and blocks nothing.
    newsletter: consent.newsletter,
    // "" is the select's "prefer not to answer"; the API spells an unanswered field null,
    // and null there means nobody asked - which is not the same as declining to say.
    profile: { ...basics, sex_at_birth: clean(basics.sex_at_birth) },
    // The fair's own question, asked only while a stand is open (V3-0013). The API
    // ignores it when it is not, so a stale tab cannot enqueue anyone.
    wants_device_test: wantsDeviceTest,
    wants_beta: false,
  };
}

/** The profile as `PUT /auth/me/profile` wants it: blanks become nulls, languages a list. */
export function toProfilePayload(profile: ProfileForm) {
  return {
    ...profile,
    sex_at_birth: clean(profile.sex_at_birth),
    gender: clean(profile.gender),
    gender_other: clean(profile.gender_other),
    education_level: clean(profile.education_level),
    education_level_other: clean(profile.education_level_other),
    occupation: clean(profile.occupation),
    occupation_other: clean(profile.occupation_other),
    native_languages: profile.native_languages
      ? profile.native_languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    meditation_practice: clean(profile.meditation_practice),
    nicotine_use: clean(profile.nicotine_use),
    alcohol_use: clean(profile.alcohol_use),
    medications: clean(profile.medications),
    neurological_conditions: clean(profile.neurological_conditions),
    psychiatric_conditions: clean(profile.psychiatric_conditions),
    vision_correction: clean(profile.vision_correction),
    hearing_issues: clean(profile.hearing_issues),
    hearing_issues_other: clean(profile.hearing_issues_other),
    notes: clean(profile.notes),
    musical_training_years: profile.musical_training_years ?? null,
    caffeine_cups_per_day: profile.caffeine_cups_per_day ?? null,
    avg_sleep_hours: profile.avg_sleep_hours ?? null,
  };
}
