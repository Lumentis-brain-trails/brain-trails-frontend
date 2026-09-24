"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { setTheme, useTheme } from "@/lib/theme";
import type { UserInfo } from "@/lib/types";
import { Logo } from "@/components/Logo";
import { cn, Icon, type IconName } from "@/components/ui";
import { type ConsentData } from "@/components/account/PrivacyCard";
import { PolicyUpdateGate } from "@/components/PolicyUpdateGate";

type Section = { href: string; label: string; icon: IconName };

/** Where the work happens, in the order a session goes: pick, record, read. */
const MAIN: Section[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/protocols", label: "Protocols", icon: "protocol" },
  { href: "/media", label: "My media", icon: "library" },
  { href: "/recordings", label: "Recordings", icon: "recordings" },
];

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
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

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

  // Following a link inside the drawer closes it: the state resets when the path
  // it was opened on is no longer the current one.
  if (open && openedAt !== pathname) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (stale && consent.data) return <PolicyUpdateGate consent={consent.data} />;

  return (
    <>
      <header className="app-topbar material-glass fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-hairline px-4 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
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
          Braintrails
        </Link>
        <span className="w-10" aria-hidden />
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
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

function Sidebar({ pathname, open }: { pathname: string; open: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });
  const secondary: Section[] = [
    { href: "/account", label: "Account", icon: "person" },
    ...(me.data?.role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: "shield" as const }]
      : []),
  ];
  const next = theme === "dark" ? "light" : "dark";

  return (
    <aside
      aria-label="Sections"
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
          Braintrails
        </span>
      </Link>

      <nav className="flex flex-col items-center gap-1">
        {MAIN.map((s) => (
          <RailLink
            key={s.href}
            section={s}
            current={isCurrentSection(pathname, s.href)}
          />
        ))}
      </nav>

      <div className="my-2 h-px w-8 bg-hairline" aria-hidden />

      <nav aria-label="You" className="flex flex-col items-center gap-1">
        {secondary.map((s) => (
          <RailLink
            key={s.href}
            section={s}
            current={isCurrentSection(pathname, s.href)}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          icon={theme === "dark" ? "sun" : "moon"}
          label={theme === "dark" ? "Light appearance" : "Dark appearance"}
          onClick={() => setTheme(next)}
        />
        <RailButton
          icon="signout"
          label="Sign out"
          onClick={async () => {
            await api.logout();
            router.push("/login");
          }}
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
  current,
}: {
  section: Section;
  current: boolean;
}) {
  return (
    <Link
      href={section.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        ITEM,
        current
          ? "bg-ink text-canvas"
          : "text-ink-2 hover:bg-accent-soft hover:text-ink"
      )}
    >
      <Icon name={section.icon} className="h-5 w-5" />
      <span
        className={cn(
          LABEL,
          current ? "text-ink" : "text-ink-2 group-hover/item:text-ink"
        )}
      >
        {section.label}
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
