"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import {
  type DocumentItem,
  type DocumentKind,
  type DocumentStatus,
  ops,
} from "@console/lib/client";
import { KINDS, type ListFilters, STATUSES, listPath } from "../lib/documents";
import { KindBadge, StatusBadge } from "./badges";

/**
 * Every document, newest change first, with filters by kind and status and a search
 * over titles and text (bt-ops searches; the box sends on Enter, not on each key).
 */
export function DocumentList({
  onOpen,
  onNew,
}: {
  onOpen: (slug: string) => void;
  /** Absent when the person may not write documents. */
  onNew?: () => void;
}) {
  const t = useTranslations("console.documents.list");
  const tKind = useTranslations("console.documents.kind");
  const tStatus = useTranslations("console.documents.status");
  const format = useFormatter();
  const errorText = useErrorText();
  const [filters, setFilters] = useState<ListFilters>({
    kind: "",
    status: "",
    q: "",
  });
  const [typed, setTyped] = useState("");
  const path = listPath(filters);
  const list = useQuery({
    queryKey: ["documents", "list", path],
    queryFn: () => ops.get<DocumentItem[]>(path),
  });
  const filtered = filters.kind || filters.status || filters.q;

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((f) => ({ ...f, q: typed }));
        }}
      >
        <Field label={t("kind")}>
          <Select
            value={filters.kind}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                kind: e.target.value as DocumentKind | "",
              }))
            }
          >
            <option value="">{t("any")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("statusLabel")}>
          <Select
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as DocumentStatus | "",
              }))
            }
          >
            <option value="">{t("any")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("search")} className="min-w-48 flex-1">
          <Input
            type="search"
            value={typed}
            maxLength={200}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary">
          {t("find")}
        </Button>
        {onNew && (
          <Button type="button" onClick={onNew}>
            {t("new")}
          </Button>
        )}
      </form>

      {list.isError && <ErrorBanner message={errorText(list.error)} />}
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.data && list.data.length === 0 ? (
        <EmptyState
          title={filtered ? t("noneFound") : t("emptyTitle")}
          text={filtered ? undefined : t("emptyText")}
        />
      ) : list.data ? (
        <Card inset className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="border-b border-hairline text-left">
              <tr className="type-caption text-ink-3">
                <th className="px-5 py-3 font-medium">{t("title")}</th>
                <th className="px-3 py-3 font-medium">{t("kind")}</th>
                <th className="px-3 py-3 font-medium">{t("statusLabel")}</th>
                <th className="px-3 py-3 font-medium">{t("audience")}</th>
                <th className="px-5 py-3 font-medium">{t("updated")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr
                  key={d.slug}
                  className="border-b border-hairline last:border-0"
                >
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(d.slug)}
                      className="text-left font-medium hover:underline"
                    >
                      {d.title}
                    </button>
                    <p className="font-mono text-[12px] text-ink-3">{d.slug}</p>
                  </td>
                  <td className="px-3 py-3">
                    <KindBadge kind={d.kind} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-3 py-3 text-ink-2">{d.audience}</td>
                  <td className="px-5 py-3 text-[13px] text-ink-2">
                    {t("updatedLine", {
                      when: format.relativeTime(new Date(d.updated_at)),
                      who: d.updated_by ?? "-",
                      revision: d.revision,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
