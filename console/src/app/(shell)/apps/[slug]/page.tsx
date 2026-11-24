"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect } from "react";
import {
  EmptyState,
  ErrorBanner,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { appFor } from "@console/apps";
import { useErrorText } from "@console/components/useErrorText";
import { useApp } from "@console/components/data";
import {
  EnvBand,
  EnvProvider,
  EnvSwitch,
  useAppEnv,
  useEnvs,
} from "@console/components/env";
import { ops, type Version } from "@console/lib/client";
import { appPath, parseAppRef } from "@console/lib/appRef";
import type { AppPageProps } from "@console/lib/manifest";

/** The title row of an open app: its name, the switch when it has one, its version. */
function AppHeader({
  slug,
  name,
  semver,
  children,
}: {
  slug: string;
  name: string;
  semver: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("console.app");
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="type-title">{name}</h1>
        {children}
      </div>
      <Link
        href={`${appPath(slug)}/about`}
        className="text-[13px] text-ink-2 hover:text-ink"
      >
        {t("versionAbout", { semver })}
      </Link>
    </div>
  );
}

/**
 * An app that reads product data (backend OPS-0005): the environment switch in its
 * header, the environment's colour on the header, and every read inside naming the
 * environment. The page remounts on a switch, so nothing read on one environment stays
 * on screen under another's header. If the console cannot say which environments it
 * reads (a bt-ops from before OPS-0005), the app opens as before, on home.
 */
function EnvApp({
  slug,
  name,
  semver,
  Page,
}: {
  slug: string;
  name: string;
  semver: string;
  Page: React.ComponentType<AppPageProps>;
}) {
  const envs = useEnvs(true);
  const { env, choose } = useAppEnv(slug, envs.data);
  if (envs.isPending) return <Skeleton className="h-64" />;
  if (!envs.data || !env) {
    return (
      <div>
        <div className="mb-6">
          <AppHeader slug={slug} name={name} semver={semver} />
        </div>
        <Page semver={semver} />
      </div>
    );
  }
  return (
    <div>
      <EnvBand env={env} home={envs.data.home}>
        <AppHeader slug={slug} name={name} semver={semver}>
          <EnvSwitch envs={envs.data} value={env} onChange={choose} />
        </AppHeader>
      </EnvBand>
      <EnvProvider env={env} home={envs.data.home}>
        <Page key={env} semver={semver} />
      </EnvProvider>
    </div>
  );
}

/**
 * An open app: `/apps/<slug>` at its current version, `/apps/<slug>@<semver>` at a named
 * one. Opening records one `app_opens` row. A native app's past versions are history -
 * one build ships them all (QUESTIONS M) - so a link to an old one shows its changelog
 * and offers the current version.
 */
export default function AppPage() {
  const t = useTranslations("console.app");
  const errorText = useErrorText();
  const params = useParams<{ slug: string }>();
  const ref = parseAppRef(params.slug);
  const app = useApp(ref?.slug ?? "");
  const open = useMutation({
    mutationFn: (semver: string | null) =>
      ops.post<Version>(`apps/${ref?.slug}/open`, { semver }),
  });
  const { mutate } = open;
  const semver = ref?.semver ?? null;
  const slug = ref?.slug;
  useEffect(() => {
    if (slug) mutate(semver);
  }, [slug, semver, mutate]);

  const manifest = ref ? appFor(ref.slug) : undefined;
  if (!ref || !manifest)
    return <EmptyState title={t("unknownTitle")} text={t("unknownText")} />;
  if (app.isError) return <ErrorBanner message={errorText(app.error)} />;
  if (!app.data) return <Skeleton className="h-64" />;

  const current = app.data.current?.semver ?? "";
  const wanted = ref.semver ?? current;
  const version = app.data.versions.find((v) => v.semver === wanted);
  if (!version)
    return (
      <EmptyState
        title={t("noVersionTitle")}
        text={t("noVersionText", { semver: wanted })}
      />
    );

  if (wanted !== current || wanted !== manifest.version) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="type-title">
          {app.data.name}{" "}
          <span className="text-ink-3">{t("version", { semver: wanted })}</span>
        </h1>
        <p className="text-ink-2">
          {t("historyText", { current: manifest.version })}
        </p>
        <p className="rounded-xl bg-surface-2 p-4 text-[14px]">
          {version.changelog}
        </p>
        <Link href={appPath(ref.slug)} className={buttonClass("primary", "sm")}>
          {t("openCurrent")}
        </Link>
      </div>
    );
  }

  const Page = manifest.Page;
  if (manifest.followsEnv) {
    return (
      <Suspense fallback={<Skeleton className="h-64" />}>
        <EnvApp
          slug={ref.slug}
          name={app.data.name}
          semver={current}
          Page={Page}
        />
      </Suspense>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <AppHeader slug={ref.slug} name={app.data.name} semver={current} />
      </div>
      <Page semver={current} />
    </div>
  );
}
