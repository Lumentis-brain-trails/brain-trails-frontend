/**
 * The console's message catalogue: its own file plus the product namespaces it shares.
 *
 * The console's words live in `console/messages/` - under `console.*`, and under
 * `admin.*` for the pages moved from the user app's `/admin` in sprint O2, which kept
 * their keys. The product namespaces below are read from the product's files, not
 * copied: the shared primitives and components (`@/components/ui`, `MediaCard`,
 * `StatusBadge`) and the moved pages read them, and they stay the product's.
 */
export const SHARED = [
  "common",
  "errors",
  "application",
  "workspaces",
  "protocols",
  "media",
  "recordings",
] as const;

export type Shared = (typeof SHARED)[number];

type Catalogue = Record<string, unknown>;

/** The console's own messages with the shared product namespaces added. */
export function catalogue(own: Catalogue, product: Catalogue): Catalogue {
  const shared = Object.fromEntries(SHARED.map((ns) => [ns, product[ns]]));
  return { ...own, ...shared };
}
