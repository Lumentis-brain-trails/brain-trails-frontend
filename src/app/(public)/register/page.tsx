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
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useAppConfig } from "@/lib/features";
import { useFairOpen } from "@/lib/fair";
import { useTaxonomies } from "@/lib/taxonomies";
import { useValidationMessage } from "@/lib/validationMessage";
import { AuthPanel } from "@/components/AuthPanel";
import { ListField } from "@/components/form/ListField";
import {
  type AccountForm,
  type BasicsForm,
  PASSWORD_MIN_LENGTH,
  accountSchema,
  basicsSchema,
  toRegisterPayload,
} from "@/lib/schemas";
import { Button, ErrorBanner, Field, Input, cn } from "@/components/ui";

/**
 * Three ticks (V3-0011, amended). The first is the consent the service needs to run at
 * all and blocks the button; the second is a separate question about research beyond
 * that; the third is a mailing list and not a consent to anything - which is why it is
 * worded in one line and sits apart. Refusing either optional one costs nothing.
 *
 * The wording of all three is in the catalogue (`public.register.consent`): the two
 * consent texts are what the person agrees to, so a locale's version of them is part of
 * the consent record and changes with the same care as the English.
 */
type Step = "account" | "you" | "consent";

/** In the order they are walked; the words are `public.register.steps.<step>`. */
const STEPS: Step[] = ["account", "you", "consent"];

function Steps({ current }: { current: Step }) {
  const t = useTranslations("public.register");
  const now = STEPS.indexOf(current) + 1;
  return (
    <ol className="flex items-center gap-2" aria-label={t("progress")}>
      {STEPS.map((key, i) => {
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
              {t(`steps.${key}`)}
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
  const t = useTranslations("public.register");
  const errorMessage = useErrorMessage();
  const fieldError = useValidationMessage();
  const config = useAppConfig();
  const lists = useTaxonomies();
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState<AccountForm | null>(null);
  const [basics, setBasics] = useState<BasicsForm | null>(null);
  const [coreConsent, setCoreConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [wantsDeviceTest, setWantsDeviceTest] = useState(false);
  const fairOpen = useFairOpen();
  // The thrown error, put into words at render so it follows the language.
  const [error, setError] = useState<unknown>(null);
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
          { core: coreConsent, research: researchConsent, newsletter },
          basics,
          fairOpen && wantsDeviceTest
        )
      );
      // Where they go depends on what the account already is: open and waiting for the
      // email, open outright, or still an application waiting for an admin.
      router.push(`/pending?status=${user.status}`);
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">{t("title")}</h1>
          <p className="mt-2 text-ink-2">{t("intro")}</p>
        </div>
        <Steps current={step} />
      </div>
      <AuthPanel>
        {error !== null && (
          <div className="mb-6">
            <ErrorBanner message={errorMessage(error)} />
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
              label={t("email")}
              error={fieldError(accountForm.formState.errors.email?.message)}
            >
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                {...accountForm.register("email")}
              />
            </Field>
            <Field
              label={t("password")}
              hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
              error={fieldError(accountForm.formState.errors.password?.message)}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...accountForm.register("password")}
              />
            </Field>
            <div className="pt-2">
              <Button type="submit">{t("continue")}</Button>
            </div>
            <p className="pt-4 text-[14px] text-ink-2">
              {t.rich("alreadyRegistered", {
                link: (chunks) => (
                  <Link
                    className="font-semibold text-ink hover:underline"
                    href="/login"
                  >
                    {chunks}
                  </Link>
                ),
              })}
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
                <h2 className="type-heading">{t("about.title")}</h2>
                <p className="mt-2 text-pretty text-ink-2">{t("about.text")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("fullName")}
                  error={fieldError(
                    basicsForm.formState.errors.full_name?.message
                  )}
                >
                  <Input
                    autoComplete="name"
                    autoFocus
                    {...basicsForm.register("full_name")}
                  />
                </Field>
                <Field
                  label={t("birthYear")}
                  error={fieldError(
                    basicsForm.formState.errors.birth_year?.message
                  )}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="1995"
                    {...basicsForm.register("birth_year")}
                  />
                </Field>
                <ListField
                  label={t("sexAtBirth")}
                  options={lists.data?.sex_at_birth}
                  field={basicsForm.register("sex_at_birth")}
                  value={sexAtBirth}
                  error={fieldError(
                    basicsForm.formState.errors.sex_at_birth?.message
                  )}
                  placeholder={t("select")}
                  info={t("sexAtBirthInfo")}
                />
                <ListField
                  label={t("handedness")}
                  options={lists.data?.handedness}
                  field={basicsForm.register("handedness")}
                  value={handedness}
                  error={fieldError(
                    basicsForm.formState.errors.handedness?.message
                  )}
                  placeholder={t("select")}
                />
              </div>
            </section>

            {fairOpen && (
              <section className="enter-up space-y-4 border-t border-hairline pt-6">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                    checked={wantsDeviceTest}
                    onChange={(e) => setWantsDeviceTest(e.target.checked)}
                  />
                  <span>
                    <span className="block">{t("fair.label")}</span>
                    <span className="type-caption text-ink-3">
                      {t("fair.hint")}
                    </span>
                  </span>
                </label>
              </section>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("account")}
              >
                {t("back")}
              </Button>
              <Button type="submit">{t("continue")}</Button>
            </div>
          </form>
        )}

        {step === "consent" && (
          <div key="consent" className="enter-up max-w-lg space-y-6">
            <p className="rounded-[var(--radius-card)] bg-surface-2 p-5 text-pretty text-ink-2">
              {t.rich("consent.core", {
                link: (chunks) => (
                  <Link
                    className="font-semibold text-ink hover:underline"
                    href="/privacy?in=tab"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {chunks}
                  </Link>
                ),
                hidden: (chunks) => <span className="sr-only">{chunks}</span>,
              })}
            </p>
            {config.data?.consent_version && (
              <p className="text-[13px] text-ink-3">
                {t("consent.version", {
                  version: config.data.consent_version,
                })}
              </p>
            )}
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={coreConsent}
                onChange={(e) => setCoreConsent(e.target.checked)}
                className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
              />
              <span>{t("consent.coreTick")}</span>
            </label>

            <section className="space-y-4 border-t border-hairline pt-6">
              <p className="rounded-[var(--radius-card)] bg-surface-2 p-5 text-pretty text-ink-2">
                {t("consent.research")}
              </p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={researchConsent}
                  onChange={(e) => setResearchConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>
                  <span className="block">{t("consent.researchTick")}</span>
                  <span className="type-caption text-ink-3">
                    {t("consent.researchHint")}
                  </span>
                </span>
              </label>
            </section>

            <section className="border-t border-hairline pt-6">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={newsletter}
                  onChange={(e) => setNewsletter(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>
                  <span className="block">{t("consent.newsletterTick")}</span>
                  <span className="type-caption text-ink-3">
                    {t("consent.newsletterHint")}
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
                {t("back")}
              </Button>
              <Button onClick={submitAll} disabled={!coreConsent || submitting}>
                {submitting ? t("creating") : t("create")}
              </Button>
            </div>
          </div>
        )}
      </AuthPanel>
    </main>
  );
}
