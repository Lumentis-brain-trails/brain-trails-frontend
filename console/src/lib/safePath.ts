/**
 * Where a sign-in may send the person next: a path on this site, nothing else.
 *
 * `from` arrives in the query string, so anyone can write it. Only a single leading `/`
 * followed by something that is not another `/` or a `\` is a path here; `//evil.com`,
 * `/\evil.com` and `https://...` are other sites to a browser, and a control character
 * or a backslash anywhere is refused rather than guessed at.
 */
export function safeFrom(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value[1] === "/" || value[1] === "\\") return null;
  if (value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
