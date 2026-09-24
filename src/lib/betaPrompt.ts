/**
 * When to ask someone to apply for the beta: once, at the end of the first report they read.
 *
 * Sign-up used to ask, before the person had seen anything they would be testing; now the
 * question waits until a report has been read to the end. The "already asked" mark lives
 * in this browser's storage rather than on the account: the answer that matters (an
 * application) is stored server side when they apply, and being asked once more on a
 * second device costs less than a column for a one-time nudge.
 */

/** localStorage key set once the prompt has been shown, whatever the answer. */
export const BETA_PROMPT_KEY = "bt-beta-asked";

/** Hash that opens the account page's beta card straight onto the application form. */
export const BETA_APPLY_HASH = "#apply-beta";

/**
 * Whether to show the prompt now.
 *
 * `wantsBeta` is the account's opt-in, or null while it is unknown (still loading, or the
 * request failed). An unknown answer never prompts: asking someone who already applied is
 * worse than missing one chance to ask.
 */
export function shouldAskBeta(wantsBeta: boolean | null): boolean {
  if (wantsBeta !== false) return false;
  try {
    return window.localStorage.getItem(BETA_PROMPT_KEY) === null;
  } catch {
    // blocked storage: we could never remember a "not now", so do not start asking
    return false;
  }
}

/** Remember that the prompt was shown, so it is not shown again in this browser. */
export function markBetaAsked(): void {
  try {
    window.localStorage.setItem(BETA_PROMPT_KEY, new Date().toISOString());
  } catch {
    // private mode or blocked storage: nothing to remember it in
  }
}
