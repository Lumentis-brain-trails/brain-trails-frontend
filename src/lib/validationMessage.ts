/**
 * Turn what a form schema says is wrong with a field into a sentence for the person.
 *
 * The schemas in `@/lib/schemas` have no locale, so an issue's `message` is a key of
 * `common.validation` (`ValidationKey`) rather than words. This is the render-site half:
 * the key becomes its translation, with the numbers the sentences quote filled in. A
 * message that is not a key is returned as it is, so a schema that has not moved to keys
 * yet - or a sentence a caller already translated - still reads the way it did.
 */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import {
  MIN_AGE_YEARS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/schemas";

type ValidationT = ReturnType<typeof useTranslations<"common.validation">>;

/** Every number a validation sentence may quote; a sentence takes the ones it names. */
const VALUES = {
  age: MIN_AGE_YEARS,
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH,
};

/** A key is one bare word; anything with a space or a full stop is already a sentence. */
const KEY_SHAPE = /^[A-Za-z]+$/;

/** The pure rule, separate from the hook so it can be tested without React. */
export function describeValidation(
  t: ValidationT,
  message: string | undefined
): string | undefined {
  if (!message) return undefined;
  if (KEY_SHAPE.test(message) && t.has(message as never)) {
    return t(message as never, VALUES as never);
  }
  return message;
}

/**
 * `const fieldError = useValidationMessage()` inside a form, then
 * `error={fieldError(errors.email?.message)}`: undefined in, undefined out, so it sits
 * directly on a `Field`.
 */
export function useValidationMessage(): (
  message: string | undefined
) => string | undefined {
  const t = useTranslations("common.validation");
  return useCallback(
    (message: string | undefined) => describeValidation(t, message),
    [t]
  );
}
