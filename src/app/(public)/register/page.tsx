"use client";

/**
 * Registration: four answers and you are in (V3-0008, amended).
 *
 * The profile and the beta credentials used to be asked here, over four steps. They are
 * not any more: at a stand with a queue behind you, every extra field is someone who
 * gives up. What is left is the account, one opt-in question, and the consent - and the
 * profile is asked later, by the backend, right before the first recording, where it is
 * about to matter and the person is already sitting down.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiRequestError, api } from "@/lib/api";
import { useAppConfig } from "@/lib/features";
import { useTaxonomies } from "@/lib/taxonomies";
import { AuthPanel } from "@/components/AuthPanel";
import { ListField } from "@/components/form/ListField";
import {
  type AccountForm,
  type BetaForm,
  accountSchema,
  betaSchema,
  toRegisterPayload,
} from "@/lib/schemas";
import { Button, ErrorBanner, Field, Input, cn } from "@/components/ui";

const CONSENT_TEXT =
  "I consent to the processing of my EEG recordings and the profile data by " +
  "LuMentis for the Brain Trails research prototype, as described in the privacy note. " +
  "I can request export or deletion of all my data at any time.";

type Step = "account" | "beta" | "consent";

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "beta", label: "Beta" },
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
  const [beta, setBeta] = useState<BetaForm | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
  });
  const betaForm = useForm<BetaForm>({
    resolver: zodResolver(betaSchema),
    defaultValues: {
      wants_beta: false,
      intended_use: "",
      intended_use_other: "",
    },
  });
  const wantsBeta = betaForm.watch("wants_beta");
  const use = betaForm.watch("intended_use");

  async function submitAll() {
    if (!account || !beta || !consent) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.post<{ status: string }>(
        "auth/register",
        toRegisterPayload(account, consent, beta)
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
            Three short steps. We ask about you later, when it matters.
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
              setStep("beta");
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

        {step === "beta" && (
          <form
            key="beta"
            noValidate
            className="enter-up max-w-lg space-y-6"
            onSubmit={betaForm.handleSubmit((values) => {
              setBeta(values);
              setStep("consent");
            })}
          >
            <div>
              <h2 className="type-heading">Would you like to test it early?</h2>
              <p className="mt-2 text-pretty text-ink-2">
                Beta testers get new features before everyone else, and we ask
                them what they think. It is free, and saying no here changes
                nothing about your account.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                {...betaForm.register("wants_beta")}
              />
              <span>Yes, I would like to be a beta tester.</span>
            </label>
            {wantsBeta && (
              <div className="enter-up">
                <ListField
                  label="How do you expect to use it?"
                  hint="It helps us choose who to invite first. You can change it later."
                  options={lists.data?.intended_use}
                  value={use}
                  field={betaForm.register("intended_use")}
                  otherField={betaForm.register("intended_use_other")}
                  placeholder="Not sure yet"
                />
              </div>
            )}
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
              {CONSENT_TEXT}{" "}
              <Link
                className="font-semibold text-ink hover:underline"
                href="/privacy"
              >
                Read the privacy note
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
                onClick={() => setStep("beta")}
              >
                Back
              </Button>
              <Button onClick={submitAll} disabled={!consent || submitting}>
                {submitting ? "Creating…" : "Create account"}
              </Button>
            </div>
          </div>
        )}
      </AuthPanel>
    </main>
  );
}
