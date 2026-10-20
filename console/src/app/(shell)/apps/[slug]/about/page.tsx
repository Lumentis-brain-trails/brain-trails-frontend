"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import { useApp } from "@console/components/data";
import { appPath, parseAppRef } from "@console/lib/appRef";

/** An app's page: its versions with their changelog, the scopes it needs, who uses it. */
export default function AboutPage() {
  const t = useTranslations("console.about");
  const format = useFormatter();
  const errorText = useErrorText();
  const ref = parseAppRef(useParams<{ slug: string }>().slug);
  const app = useApp(ref?.slug ?? "");
  if (!ref) return <EmptyState title={t("unknown")} />;
  if (app.isError) return <ErrorBanner message={errorText(app.error)} />;
  if (!app.data) return <Skeleton className="h-64" />;
  const current = app.data.current;
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="type-title">{app.data.name}</h1>
        <Link href={appPath(ref.slug)} className={buttonClass("primary", "sm")}>
          {t("open")}
        </Link>
      </div>
      <Card inset>
        <KeyValue
          label={t("current")}
          value={t("version", { semver: current?.semver ?? "-" })}
        />
        <KeyValue label={t("opens")} value={String(app.data.usage.opens_30d)} />
        <KeyValue
          label={t("people")}
          value={String(app.data.usage.people_30d)}
        />
      </Card>
      <section>
        <h2 className="type-heading mb-2">{t("scopes")}</h2>
        <p className="mb-2 text-[13px] text-ink-3">{t("scopesHint")}</p>
        <ul className="flex flex-wrap gap-2">
          {(current?.scopes ?? []).map((s) => (
            <li
              key={s}
              className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[12px]"
            >
              {s}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="type-heading mb-2">{t("widgets")}</h2>
        <ul className="text-[14px] text-ink-2">
          {(current?.widgets ?? []).map((w) => (
            <li key={String(w.id)}>{String(w.title)}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="type-heading mb-2">{t("versions")}</h2>
        <ol className="space-y-3">
          {app.data.versions.map((v) => (
            <li
              key={v.semver}
              className="rounded-xl border border-hairline p-4"
            >
              <p className="flex items-baseline justify-between gap-2">
                <Link
                  href={appPath(ref.slug, v.semver)}
                  className="font-semibold hover:underline"
                >
                  {t("version", { semver: v.semver })}
                </Link>
                <span className="text-[12px] text-ink-3">
                  {format.dateTime(new Date(v.created_at), {
                    dateStyle: "medium",
                  })}
                  {v.build_ref ? ` · ${v.build_ref.slice(0, 7)}` : ""}
                </span>
              </p>
              <p className="mt-1 text-[14px] text-ink-2">{v.changelog}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
