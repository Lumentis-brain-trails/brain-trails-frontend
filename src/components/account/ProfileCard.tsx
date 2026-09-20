"use client";

/**
 * The profile, written from the account page (V3-0008, amended).
 *
 * Registration stopped asking for any of this, so this form is where it is answered -
 * and the backend asks for the four fields at the top before a first recording, because
 * an EEG without handedness and year of birth is a file nobody can interpret. When the
 * profile is missing the card says so itself rather than waiting for a 422 to explain it
 * from inside a run that has already started.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import {
  type ProfileForm,
  profileSchema,
  toProfilePayload,
} from "@/lib/schemas";
import { useTaxonomies } from "@/lib/taxonomies";
import { ListField } from "@/components/form/ListField";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
  Textarea,
} from "@/components/ui";

/** What `GET /auth/me/profile` returns; null for every answer not given. */
export type ProfileData = Record<string, string | number | string[] | null>;

/** Turn the stored row into form values: nulls become the empty string a `<select>` wants. */
function toForm(data: ProfileData | undefined): Partial<ProfileForm> {
  if (!data) return {};
  const text = (key: string) => (data[key] == null ? "" : String(data[key]));
  const number = (key: string) =>
    data[key] == null ? undefined : Number(data[key]);
  return {
    full_name: text("full_name"),
    birth_year: number("birth_year"),
    sex_at_birth: text("sex_at_birth"),
    handedness: (text("handedness") || "right") as ProfileForm["handedness"],
    gender: text("gender"),
    gender_other: text("gender_other"),
    education_level: text("education_level"),
    education_level_other: text("education_level_other"),
    occupation: text("occupation"),
    occupation_other: text("occupation_other"),
    native_languages: Array.isArray(data.native_languages)
      ? data.native_languages.join(", ")
      : "",
    musical_training_years: number("musical_training_years"),
    meditation_practice: text("meditation_practice"),
    caffeine_cups_per_day: number("caffeine_cups_per_day"),
    nicotine_use: text("nicotine_use"),
    alcohol_use: text("alcohol_use"),
    medications: text("medications"),
    neurological_conditions: text("neurological_conditions"),
    psychiatric_conditions: text("psychiatric_conditions"),
    avg_sleep_hours: number("avg_sleep_hours"),
    vision_correction: text("vision_correction"),
    hearing_issues: text("hearing_issues"),
    hearing_issues_other: text("hearing_issues_other"),
    notes: text("notes"),
  };
}

/** The answers that come from a closed list, in the order `useWatch` returns them. */
const LIST_FIELDS = [
  "sex_at_birth",
  "handedness",
  "gender",
  "education_level",
  "occupation",
  "meditation_practice",
  "nicotine_use",
  "alcohol_use",
  "vision_correction",
  "hearing_issues",
] as const satisfies readonly (keyof ProfileForm)[];

export function ProfileCard({
  data,
  missing,
}: {
  data: ProfileData | undefined;
  /** True when no profile has been written yet, so the card explains why it matters. */
  missing: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const lists = useTaxonomies();
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema) as unknown as Resolver<ProfileForm>,
    defaultValues: toForm(data) as ProfileForm,
  });

  // The query resolves after the first render, so the form is filled when it lands.
  useEffect(() => {
    if (data) form.reset(toForm(data) as ProfileForm);
  }, [data, form]);

  const save = useMutation({
    mutationFn: (values: ProfileForm) =>
      api.put("auth/me/profile", toProfilePayload(values)),
    onSuccess: async () => {
      toast("success", "Profile saved.");
      await queryClient.invalidateQueries({ queryKey: ["me-profile"] });
    },
  });

  const errors = form.formState.errors;
  // One subscription for the answers that decide whether an `other` box is shown, rather
  // than `form.watch`, which re-renders this whole card - all ten menus - on every
  // keystroke in any field, including the free-text ones at the bottom.
  const chosen = useWatch({ control: form.control, name: LIST_FIELDS });
  const listProps = (name: (typeof LIST_FIELDS)[number], label: string) => ({
    label,
    options: lists.data?.[name],
    field: form.register(name),
    otherField: form.register(`${name}_other` as keyof ProfileForm & string),
    value: chosen[LIST_FIELDS.indexOf(name)] as string | undefined,
    error: errors[name]?.message,
  });

  return (
    <Card>
      <SectionTitle>Your profile</SectionTitle>
      {missing && (
        <p className="mt-2 text-pretty text-ink-2">
          We need the first four answers before your first recording: they are
          what makes an EEG readable afterwards. The rest is optional, always.
        </p>
      )}
      {save.error && (
        <div className="mt-4">
          <ErrorBanner
            message={
              save.error instanceof ApiRequestError
                ? save.error.error.message
                : "Could not save."
            }
          />
        </div>
      )}
      <form
        noValidate
        className="mt-6 space-y-8"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.full_name?.message}>
            <Input autoComplete="name" {...form.register("full_name")} />
          </Field>
          <Field label="Year of birth" error={errors.birth_year?.message}>
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("birth_year")}
            />
          </Field>
          <ListField
            {...listProps("sex_at_birth", "Sex at birth")}
            otherField={undefined}
            info="A variable in the analysis, asked as it is recorded at birth. Your gender is the next question and is yours to describe."
            placeholder="Select"
          />
          <ListField
            {...listProps("handedness", "Handedness")}
            otherField={undefined}
            info="Which hand you write with changes where activity appears on the scalp, so this one genuinely matters."
            placeholder="Select"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <ListField {...listProps("gender", "Gender")} />
          <ListField {...listProps("education_level", "Education")} />
          <ListField {...listProps("occupation", "Occupation")} />
          <Field label="Native languages" hint="Comma separated.">
            <Input {...form.register("native_languages")} />
          </Field>
          <Field label="Years of musical training">
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("musical_training_years")}
            />
          </Field>
          <ListField
            {...listProps("meditation_practice", "Meditation practice")}
            otherField={undefined}
          />
          <Field label="Coffee per day (cups)">
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("caffeine_cups_per_day")}
            />
          </Field>
          <Field label="Average sleep (hours)">
            <Input
              type="number"
              step="0.5"
              inputMode="decimal"
              {...form.register("avg_sleep_hours")}
            />
          </Field>
          <ListField
            {...listProps("nicotine_use", "Nicotine")}
            otherField={undefined}
          />
          <ListField
            {...listProps("alcohol_use", "Alcohol")}
            otherField={undefined}
          />
          <ListField
            {...listProps("vision_correction", "Vision correction")}
            otherField={undefined}
          />
          <ListField {...listProps("hearing_issues", "Hearing")} />
        </section>

        <section className="space-y-4">
          <Field label="Medications">
            <Input {...form.register("medications")} />
          </Field>
          <Field label="Neurological conditions">
            <Input {...form.register("neurological_conditions")} />
          </Field>
          <Field label="Psychiatric conditions">
            <Input {...form.register("psychiatric_conditions")} />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} {...form.register("notes")} />
          </Field>
        </section>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}
