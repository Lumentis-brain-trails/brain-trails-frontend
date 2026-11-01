"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, ErrorBanner, Skeleton } from "@/components/ui";
import { useFormatLocale } from "@/i18n/formatLocale";
import { useErrorMessage } from "@/lib/errorMessage";
import { api } from "@console/lib/product";

interface UserRow {
  id: string;
  email: string;
  status: string;
  member_since: string;
  recordings: number;
  total_minutes: number;
  last_activity: string | null;
}

/**
 * Every account with its status, recordings and last activity: the participants table of
 * the user app's admin dashboard (`GET /admin/users`), moved here in sprint O2. The
 * dashboard's counts went to Overview, and to Statistics in O3.
 */
export function PeopleSection() {
  const t = useTranslations("admin.dashboard.participants");
  const tStatus = useTranslations("admin.statuses");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserRow[]>("admin/users"),
  });
  if (users.isPending) return <Skeleton className="h-32" />;
  if (users.isError) return <ErrorBanner message={errorMessage(users.error)} />;
  return (
    <Card inset className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead className="border-b border-hairline text-left">
          <tr className="type-caption text-ink-3">
            <th className="px-5 py-3 font-medium">{t("participant")}</th>
            <th className="px-3 py-3 font-medium">{t("status")}</th>
            <th className="px-3 py-3 text-right font-medium">
              {t("recordings")}
            </th>
            <th className="px-3 py-3 text-right font-medium">{t("minutes")}</th>
            <th className="px-5 py-3 font-medium">{t("lastActivity")}</th>
          </tr>
        </thead>
        <tbody>
          {users.data.map((u) => (
            <tr key={u.id} className="border-b border-hairline last:border-0">
              <td className="px-5 py-3">{u.email}</td>
              <td className="px-3 py-3 text-ink-2 capitalize">
                {tStatus.has(u.status as never)
                  ? tStatus(u.status as never)
                  : u.status}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {u.recordings}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {u.total_minutes}
              </td>
              <td className="px-5 py-3 text-ink-2">
                {u.last_activity
                  ? new Date(u.last_activity).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
