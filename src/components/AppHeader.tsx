"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import { Button, cn } from "@/components/ui";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        pathname.startsWith(href)
          ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/recordings" className="text-lg font-bold tracking-tight">
            Brain Trails
          </Link>
          <nav className="flex gap-1">
            {link("/recordings", "Recordings")}
            {me.data?.role === "admin" && link("/admin/registrations", "Admin")}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {me.data && (
            <span className="hidden text-xs text-neutral-400 sm:block">
              {me.data.email}
            </span>
          )}
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-sm"
            onClick={async () => {
              await api.logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
