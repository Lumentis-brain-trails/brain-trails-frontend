"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { cn } from "@/components/ui";
import { type EnvsOut, type OpsClient, ops, opsIn } from "@console/lib/client";
import {
  ENVS,
  type EnvId,
  cacheEnv,
  chooseEnv,
  envTone,
  isAvailable,
  readStoredEnv,
  storeEnv,
} from "@console/lib/env";

/**
 * The environment an open app reads (backend OPS-0005), for everything drawn inside it.
 *
 * `env` is null outside an app that follows the switch: the shell, the strip, and the
 * apps whose data is the console's own. Then no `X-Ops-Env` is sent and bt-ops answers
 * from the home environment, as before OPS-0005.
 */
interface EnvState {
  env: EnvId | null;
  home: EnvId | null;
}

const EnvContext = createContext<EnvState>({ env: null, home: null });

export function EnvProvider({
  env,
  home,
  children,
}: EnvState & { children: React.ReactNode }) {
  const value = useMemo(() => ({ env, home }), [env, home]);
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

/** The environment of this part of the page, and whether it is the console's home. */
export function useOpsEnv(): EnvState & { isHome: boolean; cacheKey: string } {
  const { env, home } = useContext(EnvContext);
  return {
    env,
    home,
    isHome: env === null || env === home,
    cacheKey: cacheEnv(env, home),
  };
}

/** The ops client of this part of the page: its reads name its environment. */
export function useOps(): OpsClient {
  const { env } = useContext(EnvContext);
  return useMemo(() => (env ? opsIn(env) : ops), [env]);
}

/** Which environments this console can read; read once per tab. */
export function useEnvs(enabled: boolean) {
  return useQuery({
    queryKey: ["envs"],
    queryFn: () => ops.get<EnvsOut>("envs"),
    enabled,
  });
}

/**
 * The environment of the app `slug`: from `?env=`, else this browser's last choice for
 * the app, else home (`chooseEnv`). The chosen value is always written back to the URL
 * (replacing, not adding, a history entry), so the address bar shows what the page
 * reads and a copied link opens the same environment.
 */
export function useAppEnv(slug: string, envs: EnvsOut | undefined) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const fromUrl = search.get("env");
  const env = envs
    ? chooseEnv(
        envs,
        fromUrl,
        readStoredEnv(
          typeof window === "undefined" ? undefined : window.localStorage,
          slug
        )
      )
    : null;

  const write = useCallback(
    (next: EnvId) => {
      const params = new URLSearchParams(search.toString());
      params.set("env", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, search]
  );

  useEffect(() => {
    if (env && fromUrl !== env) write(env);
  }, [env, fromUrl, write]);

  const choose = useCallback(
    (next: EnvId) => {
      storeEnv(window.localStorage, slug, next);
      write(next);
    },
    [slug, write]
  );
  return { env, choose };
}

const TONE_HEADER = {
  danger: "border-danger bg-danger-soft",
  warn: "border-warn bg-warn-soft",
  neutral: "border-hairline bg-surface-2",
} as const;

const TONE_BADGE = {
  danger: "bg-danger text-white",
  warn: "bg-warn text-white",
  neutral: "bg-surface-3 text-ink-2",
} as const;

/**
 * The band an app's header sits in when it follows the switch: the environment's colour
 * on the header itself (prod red, beta amber, dev neutral), its name as a badge, so a
 * prod page cannot pass for a dev one.
 */
export function EnvBand({
  env,
  home,
  children,
}: {
  env: EnvId;
  home: EnvId;
  children: React.ReactNode;
}) {
  const t = useTranslations("console.env");
  const tone = envTone(env);
  return (
    <div
      data-env={env}
      className={cn(
        "mb-6 rounded-[var(--radius-card)] border-l-4 px-4 py-3",
        TONE_HEADER[tone]
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold tracking-wide uppercase",
            TONE_BADGE[tone]
          )}
        >
          {t(`name.${env}`)}
        </span>
        <span className="text-[13px] text-ink-2">
          {env === home ? t("readingHome") : t("readingOther", { home })}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * The switch: one button per environment; one without a read connection is disabled,
 * with the reason in its name for a screen reader and as a tooltip for a pointer.
 */
export function EnvSwitch({
  envs,
  value,
  onChange,
}: {
  envs: EnvsOut;
  value: EnvId;
  onChange: (env: EnvId) => void;
}) {
  const t = useTranslations("console.env");
  const known = ENVS.filter((id) => envs.envs.some((e) => e.id === id));
  return (
    <div
      role="radiogroup"
      aria-label={t("switch")}
      className="inline-flex rounded-full bg-surface p-0.5"
    >
      {known.map((id) => {
        const active = id === value;
        const available = isAvailable(envs, id);
        const reason = available ? undefined : t("unavailable");
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!available}
            title={reason}
            onClick={() => onChange(id)}
            className={cn(
              "pressable h-7 rounded-full px-3 text-[13px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-ink text-canvas"
                : "text-ink-2 enabled:hover:text-ink"
            )}
          >
            {t(`name.${id}`)}
            {reason && <span className="sr-only">{` (${reason})`}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What an app says in place of its product actions on another environment: they act on
 * the home environment only, and on prod in the product's own admin pages (OPS-0005).
 */
export function ElsewhereNotice() {
  const t = useTranslations("console.env");
  const { env, home } = useOpsEnv();
  if (!env || !home || env === home) return null;
  return (
    <p className="rounded-[var(--radius-control)] border border-hairline bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
      {t("actionsElsewhere", { env, home })}
    </p>
  );
}
