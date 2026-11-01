"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { Icon, cn } from "@/components/ui";
import { useApps, usePins } from "@console/components/data";
import { appPath, parseAppRef } from "@console/lib/appRef";
import {
  noteOpened,
  openAppsServerSnapshot,
  openAppsSnapshot,
  subscribeOpenApps,
} from "@console/lib/openApps";

function RailLink({
  href,
  name,
  active,
}: {
  href: string;
  name: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block truncate rounded-lg px-3 py-1.5 text-[14px]",
        active
          ? "bg-accent-soft font-medium text-ink"
          : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      )}
    >
      {name}
    </Link>
  );
}

/**
 * The side rail: the launcher, the apps pinned (in the person's order, at the version
 * they pinned) and the apps open in this tab, by name.
 */
export function SideRail() {
  const t = useTranslations("console.rail");
  const pathname = usePathname();
  const pins = usePins();
  const apps = useApps();
  const open = useSyncExternalStore(
    subscribeOpenApps,
    openAppsSnapshot,
    openAppsServerSnapshot
  );
  const current = pathname.startsWith("/apps/")
    ? parseAppRef(pathname.split("/")[2] ?? "")
    : null;
  const slug = current?.slug;

  useEffect(() => {
    if (slug) noteOpened(slug);
  }, [slug]);

  const names = Object.fromEntries(
    (apps.data ?? []).map((a) => [a.slug, a.name])
  );
  const pinned = pins.data ?? [];
  const openOnly = open.filter(
    (slug) => !pinned.some((p) => p.slug === slug) && names[slug]
  );

  return (
    <nav
      aria-label={t("label")}
      className="flex w-56 shrink-0 flex-col gap-5 border-r border-hairline px-3 py-5 max-md:hidden"
    >
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] font-medium",
          pathname === "/" ? "bg-accent-soft" : "hover:bg-surface-2"
        )}
      >
        <Icon name="home" />
        {t("launcher")}
      </Link>
      <div>
        <h2 className="type-eyebrow mb-1 px-3 text-ink-3">{t("pinned")}</h2>
        {pinned.length === 0 && (
          <p className="px-3 text-[13px] text-ink-3">{t("noPins")}</p>
        )}
        {pinned.map((p) => (
          <RailLink
            key={p.slug}
            href={appPath(p.slug, p.semver)}
            name={p.name}
            active={current?.slug === p.slug}
          />
        ))}
      </div>
      {openOnly.length > 0 && (
        <div>
          <h2 className="type-eyebrow mb-1 px-3 text-ink-3">{t("open")}</h2>
          {openOnly.map((slug) => (
            <RailLink
              key={slug}
              href={appPath(slug)}
              name={names[slug]}
              active={current?.slug === slug}
            />
          ))}
        </div>
      )}
    </nav>
  );
}
