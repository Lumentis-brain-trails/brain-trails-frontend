/**
 * Numbers and ages as the console shows them. Pure, so they are tested once and every
 * app and widget writes them the same way.
 */

/** A token count as people read it: `191 k`, `15.3 M` (the work log's own rule). */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

/** The unit and count of an age in seconds: what `console.age` formats. */
export function ageParts(seconds: number): {
  unit: "now" | "m" | "h" | "d";
  n: number;
} {
  if (seconds < 60) return { unit: "now", n: 0 };
  if (seconds < 3600) return { unit: "m", n: Math.floor(seconds / 60) };
  if (seconds < 86_400) return { unit: "h", n: Math.floor(seconds / 3600) };
  return { unit: "d", n: Math.floor(seconds / 86_400) };
}

/** Whether a snapshot is old enough to say so (a day): the strip greys it. */
export function isStale(seconds: number): boolean {
  return seconds >= 86_400;
}
