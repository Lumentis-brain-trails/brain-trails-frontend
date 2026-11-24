/**
 * Schools (backend V4-0012, flag `schools`): a teacher's class code, the students it lets
 * in, and the hold that keeps a student's account waiting for the teacher.
 *
 * A school is a workspace of kind `school`, but nobody works *in* it: it holds no
 * library anyone builds and no one's recordings, so it never appears in the workspace
 * switcher (`isUsable` in `@/lib/workspace`). Its teacher reaches it from `/school`.
 *
 * A student's account is held (`UserInfo.hold`) while the teacher has not verified it,
 * once refused, and when a student who joined as a minor turns 18 and owes their own
 * consent. The API answers every other route with 403 then; the shell sends the person
 * to `/waiting`, which is the one page that works.
 */
import type { components } from "@/lib/api-types";
import { isMinor } from "@/lib/subjects";
import type { Workspace } from "@/lib/workspace";

export type SchoolPreview = components["schemas"]["SchoolPreview"];
export type SchoolOut = components["schemas"]["SchoolOut"];
export type StudentRow = components["schemas"]["StudentRow"];
export type MyEnrolment = components["schemas"]["MyEnrolment"];
export type SchoolRequest = components["schemas"]["SchoolRequestIn"];
export type SchoolSignup = components["schemas"]["SchoolSignupIn"];

/** Why an account may not use the product yet; also the API's 403 code. */
export type Hold = NonNullable<components["schemas"]["UserOut"]["hold"]>;

/** Who the guardian is to the student: the backend's closed list (V4-0011). */
export const GUARDIAN_RELATIONSHIPS = ["parent", "legal_guardian"] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** Where a held account belongs: the waiting page, whatever it asked for. */
export const WAITING_PATH = "/waiting";

/** The path a signed-in account should be on instead of `pathname`, or null. */
export function heldRedirect(
  hold: Hold | null | undefined,
  pathname: string
): string | null {
  if (!hold) return null;
  return pathname === WAITING_PATH ? null : WAITING_PATH;
}

/** A class code as typed, as the API stores it: upper case, letters and digits only. */
export function normalCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Whether a typed code is complete enough to look up (eight characters). */
export function isCompleteCode(raw: string): boolean {
  return normalCode(raw).length === 8;
}

/** The schools the caller teaches in: active, with an owner or admin seat. */
export function taughtSchools(
  workspaces: Workspace[] | undefined
): Workspace[] {
  if (!Array.isArray(workspaces)) return [];
  return workspaces.filter(
    (w) =>
      w.kind === "school" &&
      w.status === "active" &&
      (w.relations.includes("owner") || w.relations.includes("admin"))
  );
}

/** What the student's sign-up form holds about the school and the guardian. */
export interface StudentAnswers {
  code: string;
  guardianName: string;
  guardianRelationship: GuardianRelationship | "";
  guardianConsent: boolean;
}

/**
 * The `school` part of `POST /auth/register`, or undefined without a code. A minor's
 * guardian goes with it; an adult's form never sends a guardian (the backend would not
 * keep it anyway).
 */
export function toSchoolSignup(
  answers: StudentAnswers,
  birthYear: number,
  now: Date = new Date()
): SchoolSignup | undefined {
  const code = normalCode(answers.code);
  if (!code) return undefined;
  if (!isMinor(birthYear, now)) return { code, guardian_consent: false };
  return {
    code,
    guardian_name: answers.guardianName.trim(),
    guardian_relationship: answers.guardianRelationship || null,
    guardian_consent: answers.guardianConsent,
  };
}

/**
 * Whether the consent step may submit: the student's own tick always, and for a minor
 * with a code the guardian's name, relationship and tick as well.
 */
export function signupReady(
  answers: StudentAnswers,
  birthYear: number | undefined,
  coreConsent: boolean,
  now: Date = new Date()
): boolean {
  if (!coreConsent) return false;
  if (!normalCode(answers.code) || !isMinor(birthYear, now)) return true;
  return (
    answers.guardianName.trim().length >= 2 &&
    answers.guardianRelationship !== "" &&
    answers.guardianConsent
  );
}
