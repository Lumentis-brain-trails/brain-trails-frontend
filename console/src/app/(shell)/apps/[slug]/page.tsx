"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import {
  EmptyState,
  ErrorBanner,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { appFor } from "@console/apps";
import { useErrorText } from "@console/components/useErrorText";
import { useApp } from "@console/components/data";
import { ops, type Version } from "@console/lib/client";
import { appPath, parseAppRef } from "@console/lib/appRef";

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
  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="type-title">{app.data.name}</h1>
        <Link
          href={`${appPath(ref.slug)}/about`}
          className="text-[13px] text-ink-2 hover:text-ink"
        >
          {t("versionAbout", { semver: current })}
        </Link>
      </div>
      <Page semver={current} />
    </div>
  );
}
