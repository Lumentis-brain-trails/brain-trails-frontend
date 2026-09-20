"use client";

/**
 * One answer from a closed list, with the free-text box its `other` option opens.
 *
 * The options come from the API (`GET /taxonomies`), never from a constant here: the
 * backend validates against the same tuples, so a menu written by hand would sooner or
 * later offer something the server refuses. While the lists are loading the field is
 * disabled rather than empty - an empty menu reads as "no answers available", which is
 * wrong and makes people reload.
 */
import type { ComponentProps } from "react";
import { Field, Input, Select } from "@/components/ui";
import { OTHER, hasOther, labelFor } from "@/lib/taxonomies";

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
  placeholder = "Prefer not to answer",
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
  /** The empty option's wording. Every one of these answers may be left unanswered. */
  placeholder?: string;
}) {
  const showOther = hasOther(options) && value === OTHER && otherField;
  return (
    <div className="space-y-2">
      <Field
        label={label}
        error={error}
        hint={options ? hint : "Loading the options…"}
        info={info}
      >
        <Select {...field} disabled={!options}>
          <option value="">{placeholder}</option>
          {(options ?? []).map((code) => (
            <option key={code} value={code}>
              {labelFor(code)}
            </option>
          ))}
        </Select>
      </Field>
      {showOther && (
        <Field label={`${label}: please say`} error={otherError}>
          <Input autoFocus {...otherField} />
        </Field>
      )}
    </div>
  );
}
