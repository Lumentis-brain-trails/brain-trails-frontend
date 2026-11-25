import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { IntlEn } from "@/i18n/testing";
import { isMinor } from "@/lib/subjects";
import {
  emptyForm,
  SubjectFields,
  type SubjectForm,
  toBody,
} from "./SubjectFields";

afterEach(() => cleanup());

const year = new Date().getFullYear();
const child = String(year - 12);

function Harness({
  lab = false,
  start,
}: {
  lab?: boolean;
  start: SubjectForm;
}) {
  const [form, setForm] = useState(start);
  return (
    <IntlEn>
      <SubjectFields form={form} onChange={setForm} lab={lab} creating />
    </IntlEn>
  );
}

test("a minor is under 18 by year of birth, an unknown year is not one", () => {
  const june = new Date(2026, 5, 1);
  expect(isMinor(2009, june)).toBe(true);
  expect(isMinor(2008, june)).toBe(false);
  expect(isMinor(null, june)).toBe(false);
});

test("a minor's consent is a guardian's, with who signed and the child's assent", () => {
  const form: SubjectForm = {
    ...emptyForm,
    birthYear: child,
    consent: true,
    consentVersion: "minor-1",
    guardianRelationship: "parent",
    assent: true,
    researchConsent: true,
  };
  expect(toBody(form, { lab: false })).toMatchObject({
    birth_year: year - 12,
    consent_attested: true,
    consent_by: "guardian",
    guardian_relationship: "parent",
    assent: true,
    research_consent: true,
  });
  const adult = toBody(
    { ...form, birthYear: "1980", guardianRelationship: "" },
    { lab: false }
  );
  expect(adult).toMatchObject({
    consent_by: "self",
    guardian_relationship: null,
    assent: false,
  });
  expect(adult).not.toHaveProperty("research_consent");
});

test("the form asks a guardian and the child's assent once the year makes a minor", () => {
  render(<Harness start={{ ...emptyForm, birthYear: child }} />);
  expect(
    screen.getByText("A parent or legal guardian signed the consent form")
  ).toBeTruthy();
  expect(screen.queryByText("Who signed")).toBeNull();
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  expect(screen.getByText("Who signed")).toBeTruthy();
  expect(screen.getByText(/The child was told what happens/)).toBeTruthy();
  expect(screen.getByText(/The guardian also agrees/)).toBeTruthy();
});

test("a laboratory is told it admits nobody under 18, and offers no consent", () => {
  render(<Harness lab start={{ ...emptyForm, birthYear: child }} />);
  expect(screen.getByRole("alert").textContent).toBe(
    "A laboratory admits no participants under 18."
  );
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
});
