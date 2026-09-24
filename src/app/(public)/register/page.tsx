"use client";

/**
 * Registration: four answers and you are in (V3-0008, amended).
 *
 * The profile and the beta credentials used to be asked here, over four steps. They are
 * not any more: at a stand with a queue behind you, every extra field is someone who
 * gives up. What is left is the account and the consent - and the profile is asked
 * later, by the backend, right before the first recording, where it is about to matter
 * and the person is already sitting down. Being a beta tester is asked last of all, once
 * they have tried a protocol and know what they would be testing.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { useAppConfig } from "@/lib/features";
import { useTaxonomies } from "@/lib/taxonomies";
import { AuthPanel } from "@/components/AuthPanel";
import { ListField } from "@/components/form/ListField";
import {
  type AccountForm,
  type BasicsForm,
  accountSchema,
  basicsSchema,
  toRegisterPayload,
} from "@/lib/schemas";
import { Button, ErrorBanner, Field, Input, cn } from "@/components/ui";

/**
 * The two consents, worded as the privacy note words them (V3-0011). The first is what
 * the service needs to run at all and blocks the button; the second is a separate
 * question about research beyond that, and refusing it costs nothing.
 */
const CORE_CONSENT_TEXT =
  "Lumentis will collect and process my EEG recordings, exercise responses and related " +
  "technical information to provide my results, metrics, visualizations and reports; to " +
  "maintain and secure the service; to assess signal quality and troubleshoot; and to " +
  "evaluate and improve the accuracy and reliability of the features provided through it. " +
  "Recordings are held under a pseudonymous identifier and stored in Frankfurt, Germany.";

const RESEARCH_CONSENT_TEXT =
  "Lumentis may also keep and use my pseudonymised recordings, derived features and " +
  "responses for broader scientific research beyond running and improving this service - " +
  "including work on mental health, neurology and cognitive science, and developing and " +
  "validating future methods and models.";

type Step = "account" | "you" | "consent";

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "you", label: "You" },
  { key: "consent", label: "Consent" },
];

function Steps({ current }: { current: Step }) {
  const now = STEPS.findIndex((s) => s.key === current) + 1;
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map(({ key, label }, i) => {
        const n = i + 1;
        const state = n < now ? "done" : n === now ? "now" : "todo";
        return (
          <li key={key} className="flex items-center gap-2">
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
  const config = useAppConfig();
  const lists = useTaxonomies();
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState<AccountForm | null>(null);
  const [basics, setBasics] = useState<BasicsForm | null>(null);
  const [coreConsent, setCoreConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
  });
  // zod v4 coerce makes the schema input `unknown`, which react-hook-form cannot carry
  // as a field type; the cast pins the form to the parsed output type.
  const basicsForm = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema) as unknown as Resolver<BasicsForm>,
  });
  // `useWatch` and not `form.watch`: the latter re-renders this whole page - both forms,
  // every field, every menu - on each keystroke, which is what made the form feel heavy.
  const sexAtBirth = useWatch({
    control: basicsForm.control,
    name: "sex_at_birth",
  });
  const handedness = useWatch({
    control: basicsForm.control,
    name: "handedness",
  });

  async function submitAll() {
    if (!account || !basics || !coreConsent) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.post<{ status: string }>(
        "auth/register",
        toRegisterPayload(
          account,
          { core: coreConsent, research: researchConsent },
          basics
        )
      );
      // Where they go depends on what the account already is: open and waiting for the
      // email, open outright, or still an application waiting for an admin.
      router.push(`/pending?status=${user.status}`);
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.error.message : "Network error."
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Create your account.</h1>
          <p className="mt-2 text-ink-2">
            Three short steps. Four questions about you, and the rest later.
          </p>
        </div>
        <Steps current={step} />
      </div>
      <AuthPanel>
        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}

        {step === "account" && (
          <form
            key="account"
            noValidate
            className="enter-up max-w-sm space-y-4"
            onSubmit={accountForm.handleSubmit((values) => {
              setAccount(values);
              setStep("you");
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
              <Link
                className="font-semibold text-ink hover:underline"
                href="/login"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}

        {step === "you" && (
          <form
            key="you"
            noValidate
            className="enter-up max-w-lg space-y-8"
            onSubmit={basicsForm.handleSubmit((values) => {
              setBasics(values);
              setStep("consent");
            })}
          >
            <section className="space-y-4">
              <div>
                <h2 className="type-heading">A little about you.</h2>
                <p className="mt-2 text-pretty text-ink-2">
                  Four questions. They are the ones an EEG cannot be read
                  without - which hand you write with changes where activity
                  shows up on the scalp. Everything else can wait.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  error={basicsForm.formState.errors.full_name?.message}
                >
                  <Input
                    autoComplete="name"
                    autoFocus
                    {...basicsForm.register("full_name")}
                  />
                </Field>
                <Field
                  label="Year of birth"
                  error={basicsForm.formState.errors.birth_year?.message}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="1995"
                    {...basicsForm.register("birth_year")}
                  />
                </Field>
                <ListField
                  label="Sex at birth"
                  options={lists.data?.sex_at_birth}
                  field={basicsForm.register("sex_at_birth")}
                  value={sexAtBirth}
                  error={basicsForm.formState.errors.sex_at_birth?.message}
                  placeholder="Select"
                  info="A variable in the analysis, asked as it is recorded at birth. Your gender is yours to describe, on the account page."
                />
                <ListField
                  label="Handedness"
                  options={lists.data?.handedness}
                  field={basicsForm.register("handedness")}
                  value={handedness}
                  error={basicsForm.formState.errors.handedness?.message}
                  placeholder="Select"
                />
              </div>
            </section>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("account")}
              >
                Back
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        )}

        {step === "consent" && (
          <div key="consent" className="enter-up max-w-lg space-y-6">
            <p className="rounded-[var(--radius-card)] bg-surface-2 p-5 text-pretty text-ink-2">
              {CORE_CONSENT_TEXT}{" "}
              <Link
                className="font-semibold text-ink hover:underline"
                href="/privacy?in=tab"
                target="_blank"
                rel="noreferrer"
              >
                Read the privacy note
                <span className="sr-only"> (opens in a new tab)</span>
              </Link>
              .
            </p>
            {config.data?.consent_version && (
              <p className="text-[13px] text-ink-3">
                Version {config.data.consent_version}
              </p>
            )}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={coreConsent}
                onChange={(e) => setCoreConsent(e.target.checked)}
                className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
              />
              <span>I have read the privacy note and I consent.</span>
            </label>

            <section className="space-y-4 border-t border-hairline pt-6">
              <p className="rounded-[var(--radius-card)] bg-surface-2 p-5 text-pretty text-ink-2">
                {RESEARCH_CONSENT_TEXT}
              </p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={researchConsent}
                  onChange={(e) => setResearchConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>
                  <span className="block">
                    I agree to contribute my data to broader research.
                  </span>
                  <span className="type-caption text-ink-3">
                    Optional, and separate from the consent above. Saying no
                    changes nothing about your account or your results, and you
                    can change your mind on the account page at any time.
                  </span>
                </span>
              </label>
            </section>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("you")}
              >
                Back
              </Button>
              <Button onClick={submitAll} disabled={!coreConsent || submitting}>
                {submitting ? "Creating…" : "Create account"}
              </Button>
            </div>
          </div>
        )}
      </AuthPanel>
    </main>
  );
}
