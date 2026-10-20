"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { useApps, usePins, useSetPins } from "@console/components/data";
import { appPath } from "@console/lib/appRef";

/**
 * The launcher: every published app the person may open, as a card with its name,
 * version, changelog line and when they last opened it; a pin puts it on the side rail.
 */
export default function LauncherPage() {
  const t = useTranslations("console.launcher");
  const format = useFormatter();
  const apps = useApps();
  const pins = usePins();
  const setPins = useSetPins();
  const pinned = (pins.data ?? []).map((p) => p.slug);

  if (apps.isPending) return <Skeleton className="h-40" />;
  if (!apps.data?.length)
    return <EmptyState title={t("emptyTitle")} text={t("emptyText")} />;

  return (
    <div>
      <h1 className="type-title mb-6">{t("title")}</h1>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {apps.data.map((app) => {
          const isPinned = pinned.includes(app.slug);
          return (
            <li key={app.slug}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="type-heading">{app.name}</h2>
                  <span className="text-[12px] text-ink-3">
                    {t("version", { semver: app.current?.semver ?? "" })}
                  </span>
                </div>
                <p className="flex-1 text-[14px] text-ink-2">
                  {app.current?.changelog}
                </p>
                <p className="text-[12px] text-ink-3">
                  {app.last_opened_at
                    ? t("lastOpened", {
                        when: format.relativeTime(new Date(app.last_opened_at)),
                      })
                    : t("neverOpened")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={appPath(app.slug)}
                    className={buttonClass("primary", "sm")}
                  >
                    {t("open")}
                  </Link>
                  <Link
                    href={`${appPath(app.slug)}/about`}
                    className={buttonClass("ghost", "sm")}
                  >
                    {t("about")}
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={setPins.isPending}
                    onClick={() =>
                      setPins.mutate(
                        isPinned
                          ? pinned.filter((s) => s !== app.slug)
                          : [...pinned, app.slug]
                      )
                    }
                  >
                    {isPinned ? t("unpin") : t("pin")}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
