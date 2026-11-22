/**
 * Which product environment an app reads (backend OPS-0005): one console, and in each
 * app that reads product data a switch between dev, beta and prod.
 *
 * The choice lives in the URL (`?env=prod`), so a link shows what its author saw, and is
 * remembered per app in this browser; without either, the app reads the console's home
 * environment. Requests name it in `X-Ops-Env`, which the BFF forwards only when it is
 * one of the three names.
 */
import type { EnvId, EnvsOut } from "./ops-types-pending";

export type { EnvId, EnvsOut };

/** Every environment the console knows, in the order the switch shows them. */
export const ENVS: readonly EnvId[] = ["dev", "beta", "prod"];

/** The request header naming the environment a read is for. */
export const ENV_HEADER = "X-Ops-Env";

/** Whether `value` names an environment (exactly; `PROD` or ` prod` do not). */
export function isEnv(value: unknown): value is EnvId {
  return (
    typeof value === "string" && (ENVS as readonly string[]).includes(value)
  );
}

/** The localStorage key of an app's last choice. */
export function envStorageKey(slug: string): string {
  return `bto-env:${slug}`;
}

/** The environment this browser last chose for `slug`, if any and still a name. */
export function readStoredEnv(
  storage: Pick<Storage, "getItem"> | undefined,
  slug: string
): EnvId | null {
  try {
    const value = storage?.getItem(envStorageKey(slug));
    return isEnv(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remember `env` for `slug`; a browser without storage simply forgets. */
export function storeEnv(
  storage: Pick<Storage, "setItem"> | undefined,
  slug: string,
  env: EnvId
): void {
  try {
    storage?.setItem(envStorageKey(slug), env);
  } catch {
    // private window or blocked storage: the URL still carries the choice
  }
}

/** Whether the console can read `env` now. */
export function isAvailable(envs: EnvsOut, env: EnvId): boolean {
  return envs.envs.some((e) => e.id === env && e.available);
}

/**
 * The environment an app opens on.
 *
 * The URL wins whenever it names an environment, even one without a read connection: a
 * link shows what its author meant, and its panels then say the environment is not
 * readable rather than quietly showing another one. A remembered choice counts only
 * while that environment is readable. Otherwise, home.
 */
export function chooseEnv(
  envs: EnvsOut,
  fromUrl: string | null,
  stored: EnvId | null
): EnvId {
  if (isEnv(fromUrl)) return fromUrl;
  if (stored && isAvailable(envs, stored)) return stored;
  return envs.home;
}

/** How loudly a page shows its environment: prod red, beta amber, dev neutral. */
export type EnvTone = "danger" | "warn" | "neutral";

export function envTone(env: EnvId): EnvTone {
  if (env === "prod") return "danger";
  if (env === "beta") return "warn";
  return "neutral";
}

/**
 * The cache slot of a read: the home environment shares one slot whether a request
 * named it or not (the strip asks without a header, an app with one), every other
 * environment has its own, so a prod snapshot never lands in a dev panel.
 */
export function cacheEnv(env: EnvId | null, home: EnvId | null): string {
  return env === null || env === home ? "home" : env;
}
