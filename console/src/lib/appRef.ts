/**
 * An app's address: `/apps/<slug>` opens its current version, `/apps/<slug>@<semver>`
 * names one (backend OPS-0003). The `@` arrives percent-encoded in a route parameter.
 */
export interface AppRef {
  slug: string;
  semver: string | null;
}

const SLUG = /^[a-z][a-z0-9-]{1,62}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Read a route segment; null when it is neither a slug nor `slug@semver`. */
export function parseAppRef(segment: string): AppRef | null {
  const raw = decodeURIComponent(segment);
  const [slug, semver, extra] = raw.split("@");
  if (extra !== undefined || !SLUG.test(slug)) return null;
  if (semver === undefined) return { slug, semver: null };
  return SEMVER.test(semver) ? { slug, semver } : null;
}

/** The path of an app, at a version or following the current one. */
export function appPath(slug: string, semver?: string | null): string {
  return semver ? `/apps/${slug}@${semver}` : `/apps/${slug}`;
}
