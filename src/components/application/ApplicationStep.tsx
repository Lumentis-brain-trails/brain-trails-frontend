"use client";

/**
 * The beta application step of registration (backend V3-0008).
 *
 * Asks what the selection needs and nothing more: the profile and its credentials, the
 * purpose, the headband, and the device and browser the person will record on - the
 * last two prefilled from this browser, because Web Bluetooth decides who can take part
 * at all. An unsupported browser is shown as such and accepted anyway. Applicants are
 * the first readers who may not read English, so every string comes from
 * `messages/*.json`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import {
  type ApplicationForm,
  BETA_PROFILES,
  HEADBANDS,
  applicationSchema,
  detectEnvironment,
} from "@/lib/application";
import { countries, languages } from "@/lib/regions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

interface Props {
  initial: ApplicationForm | null;
  /** Omitted on the account page, where this form is not a step in a wizard. */
  onBack?: () => void;
  onDone: (values: ApplicationForm) => void;
  /** The submit button's wording; "continue" while it is a registration step. */
  submitLabel?: string;
  busy?: boolean;
}

export function ApplicationStep({
  initial,
  onBack,
  onDone,
  submitLabel,
  busy = false,
}: Props) {
  const t = useTranslations("application");
  const detected = useMemo(() => detectEnvironment(), []);
  // Built once per mount and kept as elements, not data: ~250 countries plus the
  // languages is nearly 300 DOM nodes, and rebuilding them on each render is what makes
  // a form with this step in it feel heavy to type in.
  const countryOptions = useMemo(
    () =>
      countries().map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      )),
    []
  );
  const languageOptions = useMemo(
    () =>
      languages().map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      )),
    []
  );
  const form = useForm<ApplicationForm>({
    // zod v4 coerce makes the input `unknown`; the cast pins the parsed output type.
    resolver: zodResolver(
      applicationSchema
    ) as unknown as Resolver<ApplicationForm>,
    defaultValues: initial ?? {
      requested_profile: "private",
      headband: "muse-2",
      device: detected.device,
      browser: detected.browser,
      web_bluetooth: detected.web_bluetooth,
      contact_ok: false,
    },
  });
  const profile = useWatch({
    control: form.control,
    name: "requested_profile",
  });
  const errors = form.formState.errors;
  const required = (message?: string) =>
    message === undefined
      ? undefined
      : message === "country"
        ? t("invalid_country")
        : t("required");
  const lab = profile === "lab_lead" || profile === "lab_member";

  return (
    <form
      noValidate
      className="enter-up space-y-6"
      onSubmit={form.handleSubmit(onDone)}
    >
      <section>
        <h2 className="type-subhead">{t("title")}</h2>
        <p className="type-caption mt-1 mb-4 text-pretty text-ink-3">
          {t("intro")}
        </p>
        <Field label={t("profile.label")}>
          <Select autoFocus {...form.register("requested_profile")}>
            {BETA_PROFILES.map((value) => (
              <option key={value} value={value}>
                {t(`profile.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      {profile !== "private" && (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={t("organisation")}>
            <Input {...form.register("organisation")} />
          </Field>
          <Field label={t("role_title")}>
            <Input {...form.register("role_title")} />
          </Field>
          {profile === "therapist" && (
            <Field
              label={t("registration_no")}
              hint={t("registration_no_hint")}
              error={required(errors.registration_no?.message)}
            >
              <Input {...form.register("registration_no")} />
            </Field>
          )}
          {lab && (
            <Field
              label={t("institution")}
              error={required(errors.institution?.message)}
            >
              <Input {...form.register("institution")} />
            </Field>
          )}
          {profile === "lab_member" && (
            <Field
              label={t("supervisor")}
              error={required(errors.supervisor?.message)}
            >
              <Input {...form.register("supervisor")} />
            </Field>
          )}
          <Field
            label={t("expected_subjects")}
            hint={t("expected_subjects_hint")}
          >
            <Input
              type="number"
              inputMode="numeric"
              {...form.register("expected_subjects")}
            />
          </Field>
        </section>
      )}

      <Field label={t("purpose")}>
        <Textarea rows={3} {...form.register("purpose")} />
      </Field>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label={t("headband.label")}>
          <Select {...form.register("headband")}>
            {HEADBANDS.map((value) => (
              <option key={value} value={value}>
                {t(`headband.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("device")} hint={t("detected")}>
          <Input {...form.register("device")} />
        </Field>
        <Field label={t("browser")}>
          <Input {...form.register("browser")} />
        </Field>
        <p
          className="type-caption text-ink-3 sm:col-span-2"
          data-testid="bluetooth-support"
        >
          {detected.web_bluetooth ? t("bluetooth_ok") : t("bluetooth_missing")}
        </p>
        <Field label={t("country")} error={required(errors.country?.message)}>
          <Select {...form.register("country")}>
            <option value="">{t("country_hint")}</option>
            {countryOptions}
          </Select>
        </Field>
        <Field label={t("language")}>
          <Select {...form.register("language")}>
            <option value="">{t("language_hint")}</option>
            {languageOptions}
          </Select>
        </Field>
      </section>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
          {...form.register("contact_ok")}
        />
        <span>{t("contact_ok")}</span>
      </label>

      <div className="flex gap-2">
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {submitLabel ?? t("continue")}
        </Button>
      </div>
    </form>
  );
}
