"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import {
  type LandscapeStatus,
  isRedrawn,
  readSeenEpoch,
  subscribeSeenEpoch,
} from "@/lib/landscapeStatus";
import { useFeature } from "@/lib/features";
import { useSignOut } from "@/lib/signOut";
import { setTheme, useTheme } from "@/lib/theme";
import type { UserInfo } from "@/lib/types";
import {
  type Edition,
  useEdition,
  useReloadOnWorkspaceChange,
} from "@/lib/workspace";
import { Logo } from "@/components/Logo";
import { BRAND, cn, Icon, type IconName } from "@/components/ui";
import { type ConsentData } from "@/components/account/PrivacyCard";
import { PolicyUpdateGate } from "@/components/PolicyUpdateGate";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

/** A section's name, as a key of `shell.nav` in the message catalogue. */
type SectionKey =
  | "home"
  | "protocols"
  | "media"
  | "recordings"
  | "landscape"
  | "patients"
  | "participants"
  | "people"
  | "my"
  | "account"
  | "admin";

/** The words are not here: a module has no locale, so the rail resolves `key`. */
type Section = { href: string; key: SectionKey; icon: IconName };

/** Where the work happens, in the order a session goes: pick, record, read. */
const MAIN: Section[] = [
  { href: "/home", key: "home", icon: "home" },
  { href: "/protocols", key: "protocols", icon: "protocol" },
  { href: "/media", key: "media", icon: "library" },
  { href: "/recordings", key: "recordings", icon: "recordings" },
  { href: "/landscape", key: "landscape", icon: "graph" },
];

/**
 * An organisation's rail (V4-0006): the same work, plus the people it records and its
 * staff; the Brain Landscape is a person's own map and stays in the personal workspace.
 * The people recorded are patients in a clinic and participants in a laboratory (T3):
 * one page, two words.
 */
function organisation(edition: Edition): Section[] {
  return [
    { href: "/home", key: "home", icon: "home" },
    { href: "/protocols", key: "protocols", icon: "protocol" },
    { href: "/media", key: "media", icon: "library" },
    { href: "/recordings", key: "recordings", icon: "recordings" },
    {
      href: "/patients",
      key: edition === "therapy" ? "patients" : "participants",
      icon: "person",
    },
    { href: "/people", key: "people", icon: "people" },
  ];
}

/** The sections an edition shows, in order (one place decides, V4-0006). */
export function sectionsFor(edition: Edition): Section[] {
  return edition === "personal" ? MAIN : organisation(edition);
}

/**
 * A section owns its page and everything below it. A prefix match alone would
 * light Record up on /recordings too: the next character must be a boundary.
 */
export function isCurrentSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The signed-in chrome: a rail of icons on the left that opens into labels on
 * hover or keyboard focus, drawn over the page so nothing underneath moves (the
 * motion lives in globals.css, `.app-sidebar`). Below `md` the rail becomes a
 * drawer behind a slim top bar.
 *
 * The rail also holds the appearance switch and the account, so the page itself
 * carries no chrome at all; focus mode (`useFocusMode`) slides it away.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  useReloadOnWorkspaceChange();

  // Whether this account still agrees to the note as published (V3-0011). Deliberately
  // fails open: while this is loading, or if the call fails, the app renders as usual.
  // A gate that closes on a network blip locks people out of their own data, which is a
  // worse privacy outcome than asking them again one session later.
  const consent = useQuery({
    queryKey: ["me-consent"],
    queryFn: () => api.get<ConsentData>("auth/me/consent"),
    staleTime: 60_000,
    retry: false,
  });
  const stale =
    consent.data !== undefined &&
    consent.data.core_version !== consent.data.current_version;

  // Someone's patient or participant with no seat anywhere has one surface, `/my`
  // (V4-0006): the app's pages are not theirs, and the API would refuse their lists.
  const router = useRouter();
  const me = useMe();
  const client = me.data?.shell === "client";
  useEffect(() => {
    if (client) router.replace("/my");
  }, [client, router]);

  // Following a link inside the drawer closes it: the state resets when the path
  // it was opened on is no longer the current one.
  if (open && openedAt !== pathname) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (client) return null;
  if (stale && consent.data) return <PolicyUpdateGate consent={consent.data} />;

  return (
    <>
      <header className="app-topbar material-glass fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-hairline px-4 md:hidden">
        <button
          type="button"
          aria-label={t("openNavigation")}
          aria-expanded={open}
          onClick={() => {
            setOpenedAt(pathname);
            setOpen(true);
          }}
          className="pressable -ml-1 flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-accent-soft hover:text-ink"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <Link
          href="/home"
          className="type-heading flex items-center gap-2 text-[17px]"
        >
          {BRAND}
        </Link>
        <span className="w-10" aria-hidden />
      </header>

      {open && (
        <button
          type="button"
          aria-label={t("closeNavigation")}
          onClick={() => setOpen(false)}
          className="enter-fade fixed inset-0 z-40 bg-(--scrim) md:hidden"
        />
      )}

      <Sidebar pathname={pathname} open={open} />

      <div className="app-main flex min-h-screen flex-col pt-14 md:pt-0 md:pl-16">
        {children}
      </div>
    </>
  );
}

/** The signed-in account, shared by the shell's checks (one request, cached). */
function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Whether the Brain Landscape was redrawn since this browser last showed it. Asked once
 * per page load and kept for a while, never polled: the status is a database read, and
 * the dev and prod databases must be left to sleep (backend decision 0014).
 */
function useLandscapeRedrawn(): boolean {
  const status = useQuery({
    queryKey: ["landscape-status"],
    queryFn: () => api.get<LandscapeStatus>("landscape/status"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const seen = useSyncExternalStore(
    subscribeSeenEpoch,
    readSeenEpoch,
    () => null
  );
  return isRedrawn(status.data, seen);
}

function Sidebar({ pathname, open }: { pathname: string; open: boolean }) {
  const signOut = useSignOut();
  const theme = useTheme();
  const t = useTranslations("shell");
  const tLandscape = useTranslations("landscape");
  const redrawn = useLandscapeRedrawn();
  const multi = useFeature("workspaces_multi");
  const edition = useEdition();
  const me = useMe();
  const assignments = useFeature("assignments");
  const secondary: Section[] = [
    // a private user or a therapist who is also somebody's patient (V4 question A8)
    ...(assignments && me.data?.is_client
      ? [{ href: "/my", key: "my", icon: "protocol" } as const]
      : []),
    { href: "/account", key: "account", icon: "person" },
    ...(me.data?.role === "admin"
      ? [{ href: "/admin", key: "admin", icon: "shield" } as const]
      : []),
  ];
  const next = theme === "dark" ? "light" : "dark";

  return (
    <aside
      aria-label={t("sections")}
      data-open={open}
      className={cn(
        "app-sidebar fixed inset-y-0 left-0 z-50 isolate flex w-16 flex-col items-center gap-1 py-3",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <Link
        href="/home"
        className="pressable relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-ink"
      >
        <Logo size={38} />
        <span className="reveal type-heading absolute left-12 text-[18px] whitespace-nowrap">
          {BRAND}
        </span>
      </Link>

      {multi && <WorkspaceSwitcher />}

      <nav className="flex flex-col items-center gap-1">
        {sectionsFor(multi ? edition : "personal").map((s) => (
          <RailLink
            key={s.href}
            section={s}
            label={t(`nav.${s.key}`)}
            current={isCurrentSection(pathname, s.href)}
            mark={
              s.href === "/landscape" && redrawn
                ? tLandscape("sidebarRedrawn")
                : null
            }
          />
        ))}
      </nav>

      <div className="my-2 h-px w-8 bg-hairline" aria-hidden />

      <nav aria-label={t("you")} className="flex flex-col items-center gap-1">
        {secondary.map((s) => (
          <RailLink
            key={s.href}
            section={s}
            label={t(`nav.${s.key}`)}
            current={isCurrentSection(pathname, s.href)}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          icon={theme === "dark" ? "sun" : "moon"}
          label={theme === "dark" ? t("lightAppearance") : t("darkAppearance")}
          onClick={() => setTheme(next)}
        />
        <RailButton
          icon="signout"
          label={t("signOut")}
          onClick={() => void signOut()}
        />
        {me.data && (
          <div className="relative mt-2 flex h-10 w-10 items-center justify-center">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-[13px] font-semibold text-ink uppercase"
            >
              {me.data.email.charAt(0)}
            </span>
            <span className="reveal type-caption absolute left-12 max-w-[168px] truncate text-ink-3">
              {me.data.email}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

const ITEM =
  "pressable group/item relative flex h-10 w-10 items-center justify-center rounded-xl";
const LABEL =
  "reveal absolute left-12 text-[14px] font-medium whitespace-nowrap";

function RailLink({
  section,
  label,
  current,
  mark = null,
}: {
  section: Section;
  /** The section's name in the reader's language. */
  label: string;
  current: boolean;
  /** Something new behind the link: a dot on the icon, the words after the label. */
  mark?: string | null;
}) {
  return (
    <Link
      href={section.href}
      aria-current={current ? "page" : undefined}
      aria-label={mark ? `${label} · ${mark}` : undefined}
      className={cn(
        ITEM,
        current
          ? "bg-ink text-canvas"
          : "text-ink-2 hover:bg-accent-soft hover:text-ink"
      )}
    >
      <Icon name={section.icon} className="h-5 w-5" />
      {mark && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas"
        />
      )}
      <span
        className={cn(
          LABEL,
          current ? "text-ink" : "text-ink-2 group-hover/item:text-ink"
        )}
      >
        {label}
        {mark && (
          <span
            aria-hidden
            className="ml-2 text-[12px] font-normal text-accent"
          >
            {mark}
          </span>
        )}
      </span>
    </Link>
  );
}

function RailButton({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ITEM, "text-ink-2 hover:bg-accent-soft hover:text-ink")}
    >
      <Icon name={icon} className="h-5 w-5" />
      <span className={cn(LABEL, "text-ink-2 group-hover/item:text-ink")}>
        {label}
      </span>
    </button>
  );
}
