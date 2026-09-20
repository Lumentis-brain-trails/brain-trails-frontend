/**
 * The closed answer lists, as the backend serves them (`GET /taxonomies`).
 *
 * The API owns the options and validates against the same tuples, so this module never
 * hard-codes a list: it fetches one and renders it in the order it arrives. An option
 * that exists here but not there would be a 422 the person cannot understand.
 *
 * The labels below are the only thing the frontend owns - the codes are data, the words
 * are presentation. They stay in English with the rest of the staff app; they move into
 * the message catalogue when locales arrive (S26).
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Every list the API declares, keyed by field name. */
export type Taxonomies = Record<string, string[]>;

/** The option that opens a companion free-text field. */
export const OTHER = "other";

const LABELS: Record<string, string> = {
  // sex at birth
  female: "Female",
  male: "Male",
  intersex: "Intersex",
  prefer_not_to_say: "Prefer not to say",
  // gender
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  // handedness
  left: "Left-handed",
  right: "Right-handed",
  ambidextrous: "Ambidextrous",
  // education
  primary: "Primary school",
  secondary: "Secondary school",
  vocational: "Vocational training",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
  // occupation
  student: "Student",
  healthcare: "Healthcare",
  research_academia: "Research or academia",
  education: "Education",
  engineering_it: "Engineering or IT",
  arts_media: "Arts or media",
  business_admin: "Business or administration",
  trades: "Skilled trades",
  service: "Service work",
  retired: "Retired",
  not_working: "Not working right now",
  // frequencies, shared by meditation, nicotine and alcohol
  none: "None",
  tried: "Tried it",
  former: "Used to",
  occasional: "Occasionally",
  weekly: "Weekly",
  daily: "Daily",
  // vision and hearing
  glasses: "Glasses",
  contacts: "Contact lenses",
  surgery: "Corrective surgery",
  tinnitus: "Tinnitus",
  hearing_loss: "Hearing loss",
  // intended use
  personal: "For myself",
  patients: "With patients or clients",
  research: "In research",
  teaching: "In teaching",
  // the tail
  [OTHER]: "Other",
};

/**
 * The words for one option code.
 *
 * Falls back to the code with its underscores opened up: a list can gain an option on
 * the server before this file learns its label, and a slightly clumsy word beats an
 * empty menu entry.
 */
export function labelFor(code: string): string {
  return LABELS[code] ?? code.replace(/_/g, " ");
}

/** Every list, fetched once and kept for the session: they change on deploy, not in use. */
export function useTaxonomies() {
  return useQuery({
    queryKey: ["taxonomies"],
    queryFn: () => api.get<Taxonomies>("taxonomies"),
    staleTime: Infinity,
  });
}

/** Whether this list offers `other`, and therefore needs its companion text field. */
export function hasOther(options: string[] | undefined): boolean {
  return (options ?? []).includes(OTHER);
}
