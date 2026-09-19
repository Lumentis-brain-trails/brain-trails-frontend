/** Display formatting shared by the recording screens. */

/** "4 min 12 s", "38 s", or an en dash when the duration is unknown. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

/** A calendar date in the reader's locale: "18 Sep 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
