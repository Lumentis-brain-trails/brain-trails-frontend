"use client";

/**
 * Brings the language of this browser and of the signed-in account into agreement.
 *
 * Renders nothing. Mounted once in the signed-in shell, it waits for `auth/me` (the same
 * query the sidebar reads, so no extra request) and applies `reconcileLocale`: adopt the
 * account's language here, or store this browser's on the account. Either way the two
 * agree afterwards, so the effect settles after one pass.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { reconcileLocale, takeChosenHere } from "@/i18n/accountLocale";
import { type AppLocale, setLocale } from "@/i18n/locales";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";

export function AccountLocaleSync() {
  const current = useLocale() as AppLocale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<UserInfo>("auth/me"),
    staleTime: 60_000,
    retry: false,
  });
  const account = me.data?.locale;
  const known = me.data !== undefined;

  useEffect(() => {
    if (!known) return;
    const sync = reconcileLocale(current, account, takeChosenHere());
    if (!sync) return;
    if ("adopt" in sync) {
      setLocale(sync.adopt);
      router.refresh();
      return;
    }
    // Say so in the cache first: until the request answers, `auth/me` would still read
    // the old language and the next pass would adopt it back.
    queryClient.setQueryData<UserInfo>(["me"], (user) =>
      user ? { ...user, locale: sync.store } : user
    );
    api.put("auth/me/locale", { locale: sync.store }).catch(() => {
      // Best effort: the page already reads right, and the next sign-in tries again.
    });
  }, [account, current, known, queryClient, router]);

  return null;
}
