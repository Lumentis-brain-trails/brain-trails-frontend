"use client";

/**
 * The queue of requested clinics and laboratories (backend V4-0001, sprint T2), beside
 * the application board. Approving opens the organisation and makes its requester the
 * owner; rejecting keeps the request, so the requester sees the answer. Neither gives
 * the admin anything inside it: a platform admin has no path to a recording (V4-0002).
 *
 * The organisation's name and the requester's address are shown as stored.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@console/lib/product";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { useProductFeature as useFeature } from "@console/lib/product";
import { formatDate } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ListRow,
  Segmented,
  Skeleton,
} from "@/components/ui";

type Row = components["schemas"]["AdminWorkspaceRow"];
type Decision = components["schemas"]["WorkspaceDecisionIn"]["decision"];

const TABS = ["pending", "active", "rejected"] as const;
type Tab = (typeof TABS)[number];

export function OrganisationsSection() {
  const t = useTranslations("admin.organisations");
  const tKinds = useTranslations("workspaces.kinds");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const enabled = useFeature("workspaces_multi");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");

  const rows = useQuery({
    queryKey: ["admin-organisations", tab],
    queryFn: () => api.get<Row[]>(`admin/workspaces?status=${tab}&limit=200`),
    enabled,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: Decision }) =>
      api.post<Row>(`admin/workspaces/${id}/decide`, { decision }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-organisations"] }),
  });

  return (
    <div className="max-w-4xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-heading">{t("title")}</h2>
          <p className="mt-1 text-ink-2">{t("intro")}</p>
        </div>
        <Segmented
          label={t("title")}
          value={tab}
          onChange={setTab}
          options={TABS.map((v) => ({ value: v, label: t(`tabs.${v}`) }))}
        />
      </header>

      {!enabled && <EmptyState title={t("unavailable")} />}
      {decide.isError && <ErrorBanner message={errorMessage(decide.error)} />}
      {rows.isLoading && <Skeleton className="h-32" />}
      {rows.isError && <ErrorBanner message={errorMessage(rows.error)} />}
      {rows.data && rows.data.length === 0 && (
        <EmptyState title={t(`empty.${tab}`)} />
      )}
      {rows.data && rows.data.length > 0 && (
        <Card inset>
          {rows.data.map((w) => (
            <ListRow key={w.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block text-[13px] text-ink-3">
                  {t("line", {
                    kind: tKinds(w.kind as "practice" | "lab"),
                    email: w.requested_by ?? t("gone"),
                    date: formatDate(w.created_at, locale),
                  })}
                </span>
              </span>
              {tab === "active" && (
                <span className="text-[13px] text-ink-2">
                  {t("seats", { count: w.seats })}
                </span>
              )}
              {tab === "pending" && (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ id: w.id, decision: "reject" })
                    }
                  >
                    {t("reject")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ id: w.id, decision: "approve" })
                    }
                  >
                    {t("approve")}
                  </Button>
                </span>
              )}
            </ListRow>
          ))}
        </Card>
      )}
    </div>
  );
}
