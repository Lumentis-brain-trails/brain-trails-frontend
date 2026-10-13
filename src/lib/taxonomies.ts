/**
 * The closed answer lists, as the backend serves them (`GET /taxonomies`).
 *
 * The API owns the options and validates against the same tuples, so this module never
 * hard-codes a list: it fetches one and renders it in the order it arrives. An option
 * that exists here but not there would be a 422 the person cannot understand.
 *
 * The words are the only thing the frontend owns - the codes are data, the words are
 * presentation - and they live in the message catalogue (`taxonomies.option.<code>`),
 * resolved where an option is rendered: `useOptionLabel()` in a component, `optionLabel`
 * with a translator anywhere else.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { api } from "@/lib/api";

type TaxonomiesT = ReturnType<typeof useTranslations<"taxonomies">>;

/** Every list the API declares, keyed by field name. */
export type Taxonomies = Record<string, string[]>;

/** The option that opens a companion free-text field. */
export const OTHER = "other";

/**
 * The words for one option code, in the translator's language.
 *
 * A code means the same in every list in English, but not everywhere: `none` is
 * "Nessuna" under vision correction and "Mai" under alcohol in Italian. So the catalogue
 * may refine a code per list (`taxonomies.byList.<list>.<code>`), and passing the list's
 * name - the field name `GET /taxonomies` keys it by - picks the refinement when there is
 * one. Without it, or without a refinement, the code's general words are used.
 *
 * Falls back to the code with its underscores opened up: a list can gain an option on
 * the server before the catalogue learns its words, and a slightly clumsy word beats an
 * empty menu entry.
 */
export function optionLabel(
  t: TaxonomiesT,
  code: string,
  list?: string
): string {
  const refined = `byList.${list}.${code}`;
  if (list && t.has(refined as never)) return t(refined as never);
  const general = `option.${code}`;
  if (t.has(general as never)) return t(general as never);
  return code.replace(/_/g, " ");
}

/** `const label = useOptionLabel(); label(code, list)` inside a component. */
export function useOptionLabel(): (code: string, list?: string) => string {
  const t = useTranslations("taxonomies");
  return useCallback(
    (code: string, list?: string) => optionLabel(t, code, list),
    [t]
  );
}

/** Every list, fetched once and kept for the session: they change on deploy, not in use. */
export function useTaxonomies() {
  return useQuery({
    queryKey: ["taxonomies"],
    queryFn: () => api.get<Taxonomies>("taxonomies"),
    staleTime: Infinity,
    // One retry, not the default three. When this fails it is a misconfiguration - a
    // path the BFF does not allow, say - which no amount of retrying fixes, and the
    // backoff leaves every menu disabled for seconds while it waits.
    retry: 1,
  });
}

/** Whether this list offers `other`, and therefore needs its companion text field. */
export function hasOther(options: string[] | undefined): boolean {
  return (options ?? []).includes(OTHER);
}
