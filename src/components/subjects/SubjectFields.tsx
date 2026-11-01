"use client";

/**
 * The fields of a patient's or participant's file, for adding one and for editing it.
 *
 * A laboratory never has a name field: its participants are codes (V4-0001, the backend
 * refuses one). Consent is a tick the operator attests, with the version of the signed
 * form; the date and the operator are stored by the backend. Unticked on an edit means
 * "no change": withdrawing consent is not a field (legal track).
 */
import { useTranslations } from "next-intl";
import type { SubjectIn } from "@/lib/subjects";
import { Field, Input, Select } from "@/components/ui";

export interface SubjectForm {
  code: string;
  displayName: string;
  birthYear: string;
  sex: string;
  handedness: string;
  language: "en" | "it";
  consent: boolean;
  consentVersion: string;
}

export const emptyForm: SubjectForm = {
  code: "",
  displayName: "",
  birthYear: "",
  sex: "",
  handedness: "",
  language: "en",
  consent: false,
  consentVersion: "",
};

const SEXES = ["female", "male", "intersex", "prefer_not_to_say"] as const;
const HANDS = ["right", "left", "ambidextrous"] as const;

/** The API body of a form: blanks are left out, a lab sends no name. */
export function toBody(
  form: SubjectForm,
  { lab }: { lab: boolean }
): SubjectIn {
  const year = Number(form.birthYear);
  return {
    ...(form.code.trim() ? { code: form.code.trim() } : {}),
    ...(!lab && form.displayName.trim()
      ? { display_name: form.displayName.trim() }
      : {}),
    birth_year: form.birthYear && Number.isInteger(year) ? year : null,
    sex_at_birth: (form.sex || null) as SubjectIn["sex_at_birth"],
    handedness: (form.handedness || null) as SubjectIn["handedness"],
    language: form.language,
    consent_attested: form.consent,
    consent_version: form.consent ? form.consentVersion.trim() || null : null,
  };
}

export function SubjectFields({
  form,
  onChange,
  lab,
  creating = false,
  consentGiven = false,
}: {
  form: SubjectForm;
  onChange: (form: SubjectForm) => void;
  lab: boolean;
  /** Adding: the code may be left empty for the backend to choose. */
  creating?: boolean;
  /** Editing a file whose consent is already attested: no tick to offer again. */
  consentGiven?: boolean;
}) {
  const t = useTranslations("subjects.form");
  const set = (patch: Partial<SubjectForm>) => onChange({ ...form, ...patch });
  return (
    <>
      <Field label={t("code")} hint={creating ? t("codeHint") : undefined}>
        <Input
          value={form.code}
          maxLength={64}
          required={!creating}
          onChange={(e) => set({ code: e.target.value })}
        />
      </Field>
      {!lab && (
        <Field label={t("name")} hint={t("nameHint")}>
          <Input
            value={form.displayName}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set({ displayName: e.target.value })}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("birthYear")}>
          <Input
            type="number"
            min={1900}
            max={2100}
            value={form.birthYear}
            onChange={(e) => set({ birthYear: e.target.value })}
          />
        </Field>
        <Field label={t("sex")}>
          <Select
            value={form.sex}
            onChange={(e) => set({ sex: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {SEXES.map((s) => (
              <option key={s} value={s}>
                {t(`sexes.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("handedness")}>
          <Select
            value={form.handedness}
            onChange={(e) => set({ handedness: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {HANDS.map((h) => (
              <option key={h} value={h}>
                {t(`hands.${h}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("language")}>
        <Select
          value={form.language}
          onChange={(e) => set({ language: e.target.value as "en" | "it" })}
        >
          <option value="en">{t("languages.en")}</option>
          <option value="it">{t("languages.it")}</option>
        </Select>
      </Field>
      {!consentGiven && (
        <div className="space-y-3 rounded-xl bg-surface-2 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => set({ consent: e.target.checked })}
              className="mt-0.5 h-5 w-5 rounded-md accent-(--accent)"
            />
            <span>
              <span className="block">{t("consent")}</span>
              <span className="block text-[13px] text-ink-3">
                {t("consentHint")}
              </span>
            </span>
          </label>
          {form.consent && (
            <Field label={t("consentVersion")}>
              <Input
                value={form.consentVersion}
                maxLength={32}
                required
                onChange={(e) => set({ consentVersion: e.target.value })}
              />
            </Field>
          )}
        </div>
      )}
    </>
  );
}
