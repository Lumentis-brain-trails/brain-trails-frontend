"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import {
  type AccountForm,
  type ProfileForm,
  accountSchema,
  profileSchema,
  toRegisterPayload,
} from "@/lib/schemas";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

const CONSENT_TEXT =
  "I consent to the processing of my EEG recordings and the profile data above by " +
  "LuMentis for the Brain Trails research prototype, as described in the privacy note. " +
  "I can request export or deletion of all my data at any time. (Placeholder text - v2026-09-06.)";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [account, setAccount] = useState<AccountForm | null>(null);
  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
  });
  // zod v4 coerce makes the schema input `unknown`, which react-hook-form cannot
  // carry as a field type; the cast pins the form to the parsed output type.
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema) as unknown as Resolver<ProfileForm>,
  });

  async function submitAll() {
    if (!account || !profile || !consent) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        "auth/register",
        toRegisterPayload(account, profile, consent)
      );
      router.push("/pending");
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.error.message : "Network error."
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center p-4 py-10">
      <Card className="w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Step {step} of 3 - {["account", "your profile", "consent"][step - 1]}
        </p>
        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {step === 1 && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={accountForm.handleSubmit((values) => {
              setAccount(values);
              setStep(2);
            })}
          >
            <Field
              label="Email"
              error={accountForm.formState.errors.email?.message}
            >
              <Input
                type="email"
                autoComplete="email"
                {...accountForm.register("email")}
              />
            </Field>
            <Field
              label="Password"
              hint="At least 10 characters."
              error={accountForm.formState.errors.password?.message}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...accountForm.register("password")}
              />
            </Field>
            <Button type="submit">Continue</Button>
          </form>
        )}

        {step === 2 && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={profileForm.handleSubmit((values) => {
              setProfile(values);
              setStep(3);
            })}
          >
            <p className="text-sm text-neutral-500">
              This information contextualizes your EEG data. Fields marked * are
              required.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Full name *"
                error={profileForm.formState.errors.full_name?.message}
              >
                <Input {...profileForm.register("full_name")} />
              </Field>
              <Field
                label="Birth year *"
                error={profileForm.formState.errors.birth_year?.message}
              >
                <Input type="number" {...profileForm.register("birth_year")} />
              </Field>
              <Field
                label="Sex at birth *"
                error={profileForm.formState.errors.sex_at_birth?.message}
              >
                <Input {...profileForm.register("sex_at_birth")} />
              </Field>
              <Field
                label="Handedness *"
                error={profileForm.formState.errors.handedness?.message}
              >
                <select
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  {...profileForm.register("handedness")}
                >
                  <option value="">choose...</option>
                  <option value="right">right</option>
                  <option value="left">left</option>
                  <option value="ambidextrous">ambidextrous</option>
                </select>
              </Field>
              <Field label="Gender">
                <Input {...profileForm.register("gender")} />
              </Field>
              <Field label="Education level">
                <Input {...profileForm.register("education_level")} />
              </Field>
              <Field label="Occupation">
                <Input {...profileForm.register("occupation")} />
              </Field>
              <Field
                label="Native languages"
                hint="Comma separated, e.g. it, en"
              >
                <Input {...profileForm.register("native_languages")} />
              </Field>
              <Field label="Musical training (years)">
                <Input
                  type="number"
                  {...profileForm.register("musical_training_years")}
                />
              </Field>
              <Field label="Meditation practice">
                <Input
                  placeholder="none / occasional / daily..."
                  {...profileForm.register("meditation_practice")}
                />
              </Field>
              <Field label="Caffeine (cups/day)">
                <Input
                  type="number"
                  {...profileForm.register("caffeine_cups_per_day")}
                />
              </Field>
              <Field label="Average sleep (hours)">
                <Input
                  type="number"
                  step="0.5"
                  {...profileForm.register("avg_sleep_hours")}
                />
              </Field>
              <Field label="Nicotine use">
                <Input {...profileForm.register("nicotine_use")} />
              </Field>
              <Field label="Alcohol use">
                <Input {...profileForm.register("alcohol_use")} />
              </Field>
              <Field label="Vision correction">
                <Input
                  placeholder="none / glasses / lenses"
                  {...profileForm.register("vision_correction")}
                />
              </Field>
              <Field label="Hearing issues">
                <Input {...profileForm.register("hearing_issues")} />
              </Field>
            </div>
            <Field label="Medications">
              <Input {...profileForm.register("medications")} />
            </Field>
            <Field label="Neurological conditions">
              <Input {...profileForm.register("neurological_conditions")} />
            </Field>
            <Field label="Psychiatric conditions">
              <Input {...profileForm.register("psychiatric_conditions")} />
            </Field>
            <Field label="Notes">
              <Input {...profileForm.register("notes")} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {CONSENT_TEXT}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>I have read and I consent. *</span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={submitAll} disabled={!consent || submitting}>
                {submitting ? "Submitting..." : "Submit registration"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
