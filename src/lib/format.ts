/** Display formatting shared by the recording screens. */

/**
 * "4 min 12 s", "38 s", or an en dash when the duration is unknown. `min` and `s` are
 * unit symbols, the same in every language the app speaks.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

/**
 * A calendar date, "18 Sep 2026" or "18 set 2026".
 *
 * Pass `useFormatLocale()`: left out, the browser's own language is used, which is a
 * different thing once the reader has picked a language in the app.
 */
export function formatDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
