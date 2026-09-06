/** Zod schemas mirroring the backend contracts (app/schemas.py). */
import { z } from "zod";

export const profileSchema = z.object({
  full_name: z.string().min(2).max(200),
  birth_year: z.coerce.number().int().min(1900).max(2100),
  sex_at_birth: z.string().min(1).max(30),
  handedness: z.enum(["left", "right", "ambidextrous"]),
  gender: z.string().max(50).optional().or(z.literal("")),
  education_level: z.string().max(100).optional().or(z.literal("")),
  occupation: z.string().max(200).optional().or(z.literal("")),
  native_languages: z.string().optional(), // comma-separated in the form
  musical_training_years: z.coerce.number().int().min(0).max(100).optional(),
  meditation_practice: z.string().max(100).optional().or(z.literal("")),
  caffeine_cups_per_day: z.coerce.number().int().min(0).max(50).optional(),
  nicotine_use: z.string().max(100).optional().or(z.literal("")),
  alcohol_use: z.string().max(100).optional().or(z.literal("")),
  medications: z.string().optional().or(z.literal("")),
  neurological_conditions: z.string().optional().or(z.literal("")),
  psychiatric_conditions: z.string().optional().or(z.literal("")),
  avg_sleep_hours: z.coerce.number().min(0).max(24).optional(),
  vision_correction: z.string().max(100).optional().or(z.literal("")),
  hearing_issues: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export const accountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
});

export type ProfileForm = z.output<typeof profileSchema>;
export type ProfileFormInput = z.input<typeof profileSchema>;
export type AccountForm = z.output<typeof accountSchema>;

/** Convert form values into the backend payload. */
export function toRegisterPayload(
  account: AccountForm,
  profile: ProfileForm,
  consent: boolean
) {
  const clean = (v: string | undefined) =>
    v === "" || v === undefined ? null : v;
  return {
    email: account.email,
    password: account.password,
    consent,
    profile: {
      ...profile,
      gender: clean(profile.gender),
      education_level: clean(profile.education_level),
      occupation: clean(profile.occupation),
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
      notes: clean(profile.notes),
      musical_training_years: profile.musical_training_years ?? null,
      caffeine_cups_per_day: profile.caffeine_cups_per_day ?? null,
      avg_sleep_hours: profile.avg_sleep_hours ?? null,
    },
  };
}
