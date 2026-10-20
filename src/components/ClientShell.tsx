"use client";

/**
 * The client shell (backend V4-0006, sprint T3): what someone's patient or participant
 * sees, and all of it - their sessions, Play, their account. No rail, no catalog, no
 * library, no recordings: the account cannot read them, and the shell does not pretend.
 *
 * A thin bar with the brand, the two places, the language and sign out; the page below
 * at reading width. A person who also has the app (a private user who is a clinic's
 * patient, V4 question A8) gets a way back to it.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { BRAND, cn } from "@/components/ui";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("my.nav");
  const pathname = usePathname();
  const router = useRouter();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });
  const link = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className={cn(
        "pressable rounded-full px-3 py-1.5 text-[14px] font-medium",
        pathname === href ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink"
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      {/* `app-topbar` / `app-main`: in focus mode the bar steps aside and its room goes
          with it, so a run has the black stage alone (globals.css) */}
      <header className="app-topbar material-glass fixed inset-x-0 top-0 z-40 border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Link
            href="/my"
            className="type-heading mr-2 flex items-center gap-2 text-[17px]"
          >
            <Logo size={30} />
            <span className="hidden sm:inline">{BRAND}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {link("/my", t("home"))}
            {link("/my/account", t("account"))}
            {me.data?.shell === "app" && link("/home", t("app"))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch account />
            <button
              type="button"
              className="pressable rounded-full px-3 py-1.5 text-[14px] text-ink-2 hover:text-ink"
              onClick={async () => {
                await api.logout();
                router.push("/login");
              }}
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      </header>
      <div className="app-main flex-1 pt-14">{children}</div>
    </div>
  );
}
