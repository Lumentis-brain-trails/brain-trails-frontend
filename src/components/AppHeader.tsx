"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import { Button, cn } from "@/components/ui";
import { Wordmark } from "@/components/Logo";

/**
 * Translucent app chrome. Content scrolls underneath; the active section is a
 * filled pill so "where am I" is answered without reading.
 */
export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "pressable rounded-full px-3.5 py-1.5 text-[14px] font-medium",
          active
            ? "bg-ink text-canvas"
            : "text-ink-2 hover:bg-surface-2 hover:text-ink"
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="material-glass sticky top-0 z-40 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/recordings" className="text-ink">
          <Wordmark size={16} />
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 gap-1 sm:flex">
          {link("/recordings", "Recordings")}
          {link("/account", "Account")}
          {me.data?.role === "admin" && link("/admin", "Admin")}
        </nav>
        <div className="flex items-center gap-2">
          {me.data && (
            <span className="type-caption hidden text-ink-3 md:block">
              {me.data.email}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await api.logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
        {link("/recordings", "Recordings")}
        {link("/account", "Account")}
        {me.data?.role === "admin" && link("/admin", "Admin")}
      </nav>
    </header>
  );
}
