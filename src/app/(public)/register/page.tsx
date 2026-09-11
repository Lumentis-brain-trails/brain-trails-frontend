"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Select,
  Textarea,
  cn,
} from "@/components/ui";

const CONSENT_TEXT =
  "I consent to the processing of my EEG recordings and the profile data above by " +
  "LuMentis for the Brain Trails research prototype, as described in the privacy note. " +
  "I can request export or deletion of all my data at any time. (Placeholder text - v2026-09-06.)";

const STEPS = ["Account", "Profile", "Consent"] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={state === "now" ? "step" : undefined}
              className={cn(
                "flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[12px] font-semibold transition-colors duration-(--m-fast)",
                state === "now" && "bg-ink text-canvas",
                state === "done" && "bg-surface-3 text-ink",
                state === "todo" && "bg-surface-2 text-ink-3"
              )}
            >
              {n}
            </span>
            <span
              className={cn(
                "text-[13px]",
                state === "now" ? "font-medium text-ink" : "text-ink-3"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-6 bg-hairline-strong" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

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

  const perr = profileForm.formState.errors;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Create your account.</h1>
          <p className="mt-2 text-ink-2">
            Three short steps. Registrations are reviewed by an administrator.
          </p>
        </div>
        <Steps current={step} />
      </div>
      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {step === 1 && (
        <form
          key="account"
          noValidate
          className="enter-up max-w-sm space-y-4"
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
              autoFocus
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
          <div className="pt-2">
            <Button type="submit">Continue</Button>
          </div>
          <p className="pt-4 text-[14px] text-ink-2">
            Already registered?{" "}
            <Link className="text-accent hover:underline" href="/login">
              Sign in
            </Link>
          </p>
        </form>
      )}

      {step === 2 && (
        <form
          key="profile"
          noValidate
          className="enter-up space-y-8"
          onSubmit={profileForm.handleSubmit((values) => {
            setProfile(values);
            setStep(3);
          })}
        >
          <section>
            <h2 className="type-subhead">About you</h2>
            <p className="type-caption mt-1 mb-4 text-ink-3">
              Required. This information contextualises your EEG data.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={perr.full_name?.message}>
                <Input autoFocus {...profileForm.register("full_name")} />
              </Field>
              <Field label="Birth year" error={perr.birth_year?.message}>
                <Input
                  type="number"
                  inputMode="numeric"
                  {...profileForm.register("birth_year")}
                />
              </Field>
              <Field label="Sex at birth" error={perr.sex_at_birth?.message}>
                <Input {...profileForm.register("sex_at_birth")} />
              </Field>
              <Field label="Handedness" error={perr.handedness?.message}>
                <Select {...profileForm.register("handedness")}>
                  <option value="">Choose…</option>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="ambidextrous">Ambidextrous</option>
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h2 className="type-subhead">Background</h2>
            <p className="type-caption mt-1 mb-4 text-ink-3">
              Optional. Leave blank what you prefer not to share.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  inputMode="numeric"
                  {...profileForm.register("musical_training_years")}
                />
              </Field>
              <Field label="Meditation practice">
                <Input
                  placeholder="none / occasional / daily"
                  {...profileForm.register("meditation_practice")}
                />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="type-subhead">Habits and health</h2>
            <p className="type-caption mt-1 mb-4 text-ink-3">
              Optional. Helps interpret the signal.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Caffeine (cups per day)">
                <Input
                  type="number"
                  inputMode="numeric"
                  {...profileForm.register("caffeine_cups_per_day")}
                />
              </Field>
              <Field label="Average sleep (hours)">
                <Input
                  type="number"
                  step="0.5"
                  inputMode="decimal"
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
            <div className="mt-4 space-y-4">
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
                <Textarea rows={3} {...profileForm.register("notes")} />
              </Field>
            </div>
          </section>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div key="consent" className="enter-up max-w-lg space-y-6">
          <p className="rounded-[var(--radius-card)] bg-surface-2 p-5 text-pretty text-ink-2">
            {CONSENT_TEXT}
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
            />
            <span>I have read the note and I consent.</span>
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(2)}
            >
              Back
            </Button>
            <Button onClick={submitAll} disabled={!consent || submitting}>
              {submitting ? "Submitting…" : "Submit registration"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
