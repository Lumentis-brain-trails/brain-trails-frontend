/**
 * Keeping the language of this browser and the language of the account the same.
 *
 * Two places remember the choice. The `bt-locale` cookie is what the server renders
 * from, and works signed out; `users.locale` on the account is what follows the person
 * to another browser and what the backend writes its mail in (backend V3-0018). They can
 * disagree at sign-in, and `reconcileLocale` says who gives way:
 *
 * - a language picked on this browser a moment ago, while signed out (the switch on the
 *   entry screens), is the freshest intent: it is stored on the account;
 * - otherwise the account's language wins, so a choice made elsewhere arrives here;
 * - an account that never chose takes the language its owner is reading right now, so
 *   the next email matches what they see.
 *
 * Kept as a pure function, away from React and the network, so the rule is testable.
 */
import { type AppLocale, isLocale } from "./locales";

/**
 * sessionStorage key for "the person picked this language here, signed out". Tab-scoped
 * and gone when the tab closes, which is exactly how long such an intent is fresh.
 */
export const CHOSEN_HERE_KEY = "bt-locale-chosen";

/** What to do so that browser and account agree; null when they already do. */
export type LocaleSync = { adopt: AppLocale } | { store: AppLocale } | null;

/**
 * @param current    the language this page is rendered in
 * @param account    `users.locale` as `GET /auth/me` returned it (null: never chosen)
 * @param chosenHere the value under `CHOSEN_HERE_KEY`, if any
 */
export function reconcileLocale(
  current: AppLocale,
  account: string | null | undefined,
  chosenHere: string | null
): LocaleSync {
  if (isLocale(chosenHere))
    return account === chosenHere ? null : { store: chosenHere };
  if (isLocale(account)) return account === current ? null : { adopt: account };
  return { store: current };
}

/** Note a signed-out choice for the next sign-in in this tab. */
export function rememberChosenHere(locale: AppLocale): void {
  try {
    window.sessionStorage.setItem(CHOSEN_HERE_KEY, locale);
  } catch {
    // blocked storage: the account's language will win at sign-in, which is the default
  }
}

/** Read and forget the signed-out choice: it is acted on once. */
export function takeChosenHere(): string | null {
  try {
    const value = window.sessionStorage.getItem(CHOSEN_HERE_KEY);
    window.sessionStorage.removeItem(CHOSEN_HERE_KEY);
    return value;
  } catch {
    return null;
  }
}
