"use client";

/**
 * One answer from a closed list, with the free-text box its `other` option opens.
 *
 * The options come from the API (`GET /taxonomies`), never from a constant here: the
 * backend validates against the same tuples, so a menu written by hand would sooner or
 * later offer something the server refuses. While the lists are loading the field is
 * disabled rather than empty - an empty menu reads as "no answers available", which is
 * wrong and makes people reload.
 *
 * The codes are the API's, the words are the catalogue's: each option is named by
 * `useOptionLabel`, in the reader's language and for this list in particular.
 */
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Field, Input, Select } from "@/components/ui";
import { OTHER, hasOther, useOptionLabel } from "@/lib/taxonomies";

export function ListField({
  label,
  options,
  field,
  otherField,
  value,
  error,
  otherError,
  hint,
  info,
  placeholder,
  list,
}: {
  label: string;
  /** The list as the API serves it; undefined while it is still loading. */
  options: string[] | undefined;
  /** The select's own props: a react-hook-form registration fits as it is. */
  field: ComponentProps<"select">;
  /** The companion `<name>_other` field, for a list that offers `other`. */
  otherField?: ComponentProps<"input">;
  /** The value currently selected, so the companion appears exactly when it applies. */
  value?: string;
  error?: string;
  otherError?: string;
  hint?: string;
  info?: string;
  /**
   * The empty option's wording; "Prefer not to answer" in the reader's language when
   * left out. Every one of these answers may be left unanswered.
   */
  placeholder?: string;
  /**
   * The list's name in `GET /taxonomies`, which picks the wording a code has in this
   * list when it differs from its general one. Defaults to the select's `name`: a field
   * is registered under the name of the list it answers.
   */
  list?: string;
}) {
  const t = useTranslations("common");
  const optionLabel = useOptionLabel();
  const listName = list ?? field.name;
  const showOther = hasOther(options) && value === OTHER && otherField;
  return (
    <div className="space-y-2">
      <Field
        label={label}
        error={error}
        hint={options ? hint : t("loadingOptions")}
        info={info}
      >
        <Select {...field} disabled={!options}>
          <option value="">{placeholder ?? t("preferNotToAnswer")}</option>
          {(options ?? []).map((code) => (
            <option key={code} value={code}>
              {optionLabel(code, listName)}
            </option>
          ))}
        </Select>
      </Field>
      {showOther && (
        <Field label={t("otherPleaseSay", { label })} error={otherError}>
          <Input autoFocus {...otherField} />
        </Field>
      )}
    </div>
  );
}
