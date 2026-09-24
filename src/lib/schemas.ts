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
  full_name: z.string().min(2).max(200),
  birth_year: z.coerce.number().int().min(1900).max(2100),
  sex_at_birth: z.string().max(30).optional().or(z.literal("")),
  handedness: z.enum(["left", "right", "ambidextrous"]),
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

export const accountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
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
 */
export const basicsSchema = profileSchema
  .pick({
    full_name: true,
    birth_year: true,
    sex_at_birth: true,
    handedness: true,
  })
  .refine((v) => new Date().getFullYear() - v.birth_year >= MIN_AGE_YEARS, {
    path: ["birth_year"],
    message: `Brain Trails is for people aged ${MIN_AGE_YEARS} and over.`,
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
  consent: { core: boolean; research: boolean },
  basics: BasicsForm
) {
  return {
    email: account.email,
    password: account.password,
    // `consent` is the required one and keeps the name the API has always used for it;
    // `research_consent` is the separate optional question (V3-0011).
    consent: consent.core,
    research_consent: consent.research,
    // "" is the select's "prefer not to answer"; the API spells an unanswered field null,
    // and null there means nobody asked - which is not the same as declining to say.
    profile: { ...basics, sex_at_birth: clean(basics.sex_at_birth) },
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
