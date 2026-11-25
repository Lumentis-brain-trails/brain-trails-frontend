"use client";

/**
 * The fields of a patient's or participant's file, for adding one and for editing it.
 *
 * A laboratory never has a name field: its participants are codes (V4-0001, the backend
 * refuses one). Consent is a tick the operator attests, with the version of the signed
 * form; the date and the operator are stored by the backend. Unticked on an edit means
 * "no change": withdrawing consent is not a field (legal track).
 *
 * Minors (V4-0011), told by the year of birth: in a clinic the tick becomes a parent's or
 * legal guardian's signature, with who signed and the child's own assent, and an optional
 * guardian's consent to the averages; a laboratory is told it admits nobody under 18. A
 * year of birth is needed to attest at all.
 */
import { useTranslations } from "next-intl";
import { isMinor, type SubjectIn } from "@/lib/subjects";
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
  guardianRelationship: "" | "parent" | "legal_guardian";
  assent: boolean;
  researchConsent: boolean;
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
  guardianRelationship: "",
  assent: false,
  researchConsent: false,
};

const SEXES = ["female", "male", "intersex", "prefer_not_to_say"] as const;
const HANDS = ["right", "left", "ambidextrous"] as const;
const GUARDIANS = ["parent", "legal_guardian"] as const;

function yearOf(form: SubjectForm): number | null {
  const year = Number(form.birthYear);
  return form.birthYear && Number.isInteger(year) ? year : null;
}

/** The API body of a form: blanks are left out, a lab sends no name. */
export function toBody(
  form: SubjectForm,
  { lab }: { lab: boolean }
): SubjectIn {
  const year = yearOf(form);
  const minor = isMinor(year);
  return {
    ...(form.code.trim() ? { code: form.code.trim() } : {}),
    ...(!lab && form.displayName.trim()
      ? { display_name: form.displayName.trim() }
      : {}),
    birth_year: year,
    sex_at_birth: (form.sex || null) as SubjectIn["sex_at_birth"],
    handedness: (form.handedness || null) as SubjectIn["handedness"],
    language: form.language,
    consent_attested: form.consent,
    consent_version: form.consent ? form.consentVersion.trim() || null : null,
    consent_by: form.consent ? (minor ? "guardian" : "self") : null,
    guardian_relationship:
      form.consent && minor ? form.guardianRelationship || null : null,
    assent: form.consent && minor && form.assent,
    ...(minor && !lab ? { research_consent: form.researchConsent } : {}),
  };
}

export function SubjectFields({
  form,
  onChange,
  lab,
  creating = false,
  consentGiven = false,
  reconsent = false,
}: {
  form: SubjectForm;
  onChange: (form: SubjectForm) => void;
  lab: boolean;
  /** Adding: the code may be left empty for the backend to choose. */
  creating?: boolean;
  /** Editing a file whose consent is already attested: no tick to offer again. */
  consentGiven?: boolean;
  /** A guardian's consent for someone now 18: their own is asked (V4-0011). */
  reconsent?: boolean;
}) {
  const t = useTranslations("subjects.form");
  const set = (patch: Partial<SubjectForm>) => onChange({ ...form, ...patch });
  const minor = isMinor(yearOf(form));
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
            required={form.consent}
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
      {lab && minor && (
        <p role="alert" className="text-[14px] text-danger">
          {t("labMinor")}
        </p>
      )}
      {!consentGiven && !(lab && minor) && (
        <div className="space-y-3 rounded-xl bg-surface-2 p-4">
          {reconsent && (
            <p className="text-[14px] text-ink-2">{t("reconsent")}</p>
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => set({ consent: e.target.checked })}
              className="mt-0.5 h-5 w-5 rounded-md accent-(--accent)"
            />
            <span>
              <span className="block">
                {minor ? t("consentGuardian") : t("consent")}
              </span>
              <span className="block text-[13px] text-ink-3">
                {minor ? t("consentGuardianHint") : t("consentHint")}
              </span>
            </span>
          </label>
          {form.consent && !form.birthYear && (
            <p className="text-[13px] text-ink-3">{t("birthYearForConsent")}</p>
          )}
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
          {form.consent && minor && (
            <>
              <Field label={t("guardianRelationship")}>
                <Select
                  value={form.guardianRelationship}
                  required
                  onChange={(e) =>
                    set({
                      guardianRelationship: e.target
                        .value as SubjectForm["guardianRelationship"],
                    })
                  }
                >
                  <option value="">{t("none")}</option>
                  {GUARDIANS.map((g) => (
                    <option key={g} value={g}>
                      {t(`guardianRelationships.${g}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.assent}
                  required
                  onChange={(e) => set({ assent: e.target.checked })}
                  className="mt-0.5 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>{t("assent")}</span>
              </label>
            </>
          )}
        </div>
      )}
      {minor && !lab && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-4">
          <input
            type="checkbox"
            checked={form.researchConsent}
            onChange={(e) => set({ researchConsent: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded-md accent-(--accent)"
          />
          <span>
            <span className="block">{t("researchConsent")}</span>
            <span className="block text-[13px] text-ink-3">
              {t("researchConsentHint")}
            </span>
          </span>
        </label>
      )}
    </>
  );
}
