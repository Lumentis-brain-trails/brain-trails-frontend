"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import {
  type DocumentOut,
  type DocumentStatus,
  OpsRequestError,
  type RevisionItem,
  type RevisionOut,
  ops,
} from "@console/lib/client";
import { nextStatuses } from "../lib/documents";
import { Markdown } from "../Markdown";
import { DocumentEditor } from "./DocumentEditor";
import { KindBadge, StatusBadge } from "./badges";

const docPath = (slug: string) => `documents/${encodeURIComponent(slug)}`;

/** Every saved revision, newest first; a click opens one. */
function History({
  slug,
  current,
  shown,
  onOpen,
}: {
  slug: string;
  current: number;
  shown: number | null;
  onOpen: (revision: number | null) => void;
}) {
  const t = useTranslations("console.documents.history");
  const format = useFormatter();
  const errorText = useErrorText();
  const revisions = useQuery({
    queryKey: ["documents", "revisions", slug],
    queryFn: () => ops.get<RevisionItem[]>(`${docPath(slug)}/revisions`),
  });
  if (revisions.isPending) return <Skeleton className="h-24" />;
  if (revisions.isError)
    return <ErrorBanner message={errorText(revisions.error)} />;
  const rows = [...revisions.data].sort((a, b) => b.revision - a.revision);
  return (
    <Card inset>
      <h3 className="border-b border-hairline px-5 py-3 type-heading">
        {t("title")}
      </h3>
      <ol>
        {rows.map((r) => {
          const isShown = (shown ?? current) === r.revision;
          return (
            <li
              key={r.revision}
              className="border-b border-hairline px-5 py-3 text-[14px] last:border-0"
            >
              <button
                type="button"
                aria-current={isShown ? "true" : undefined}
                onClick={() =>
                  onOpen(r.revision === current ? null : r.revision)
                }
                className="w-full text-left"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={isShown ? "font-semibold" : "font-medium"}>
                    {t("revision", { revision: r.revision })}
                    {r.revision === current && ` · ${t("current")}`}
                  </span>
                  <span className="text-[12px] text-ink-3">
                    {t("by", {
                      who: r.author ?? "-",
                      when: format.dateTime(new Date(r.created_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </span>
                </span>
                <span className="mt-0.5 block text-ink-2">
                  {r.note || t("noNote")}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Move the document to another status, on the revision the page shows. */
function StatusActions({ doc }: { doc: DocumentOut }) {
  const t = useTranslations("console.documents.view");
  const errorText = useErrorText();
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: (status: DocumentStatus) =>
      ops.post<DocumentOut>(`${docPath(doc.slug)}/status`, {
        revision: doc.revision,
        status,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      if (error instanceof OpsRequestError && error.code === "stale_document")
        void client.invalidateQueries({
          queryKey: ["documents", "doc", doc.slug],
        });
    },
  });
  return (
    <>
      {nextStatuses(doc.status).map((s) => (
        <Button
          key={s}
          size="sm"
          variant="secondary"
          disabled={change.isPending}
          onClick={() => change.mutate(s)}
        >
          {t(`to.${s}`)}
        </Button>
      ))}
      {change.isError && (
        <div className="basis-full">
          <ErrorBanner message={errorText(change.error)} />
        </div>
      )}
    </>
  );
}

/**
 * One document: its current revision drawn from Markdown, or an older one named in the
 * address (`rev`); its history; and, for a person who may write, the editor and the
 * status buttons. An old revision is only read: editing always starts from the current.
 */
export function DocumentView({
  slug,
  revision,
  canWrite,
  onBack,
  onOpenRevision,
}: {
  slug: string;
  revision: number | null;
  canWrite: boolean;
  onBack: () => void;
  onOpenRevision: (revision: number | null) => void;
}) {
  const t = useTranslations("console.documents.view");
  const format = useFormatter();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(revision !== null);
  const doc = useQuery({
    queryKey: ["documents", "doc", slug],
    queryFn: () => ops.get<DocumentOut>(docPath(slug)),
  });
  const old = useQuery({
    queryKey: ["documents", "revision", slug, revision],
    queryFn: () =>
      ops.get<RevisionOut>(`${docPath(slug)}/revisions/${revision}`),
    enabled: revision !== null,
  });

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="text-[13px] text-ink-2 hover:text-ink"
    >
      {t("back")}
    </button>
  );

  if (doc.isPending) return <Skeleton className="h-64" />;
  if (doc.isError) {
    const missing =
      doc.error instanceof OpsRequestError && doc.error.status === 404;
    return (
      <div className="grid gap-4">
        {back}
        {missing ? (
          <EmptyState title={t("missingTitle")} text={t("missingText")} />
        ) : (
          <ErrorBanner message={errorText(doc.error)} />
        )}
      </div>
    );
  }

  const d = doc.data;
  if (editing) {
    return (
      <div className="grid gap-4">
        {back}
        <DocumentEditor
          key={d.revision}
          doc={d}
          onSaved={() => {
            setEditing(false);
            onOpenRevision(null);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const shownOld = revision !== null && revision !== d.revision;
  const body = shownOld ? old.data?.body : d.body;
  const title = shownOld ? (old.data?.title ?? d.title) : d.title;

  return (
    <div className="grid gap-5">
      {back}
      <header className="grid gap-2">
        <h2 className="type-title">{title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <KindBadge kind={d.kind} />
          <StatusBadge status={d.status} />
          <span>{t("for", { audience: d.audience })}</span>
          <span className="text-ink-3">
            {t("meta", {
              revision: d.revision,
              who: d.updated_by ?? "-",
              when: format.dateTime(new Date(d.updated_at), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && !shownOld && (
            <>
              <Button size="sm" onClick={() => setEditing(true)}>
                {t("edit")}
              </Button>
              <StatusActions doc={d} />
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? t("hideHistory") : t("showHistory")}
          </Button>
        </div>
      </header>

      {shownOld && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-[14px]">
          <span>
            {old.data
              ? t("oldRevision", {
                  revision: old.data.revision,
                  current: d.revision,
                  who: old.data.author ?? "-",
                  note: old.data.note || "-",
                })
              : t("loadingRevision", { revision: String(revision) })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenRevision(null)}
          >
            {t("toCurrent")}
          </Button>
        </div>
      )}

      <div
        className={
          showHistory ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" : ""
        }
      >
        <Card className="min-w-0">
          {shownOld && old.isError ? (
            <ErrorBanner message={errorText(old.error)} />
          ) : body === undefined ? (
            <Skeleton className="h-40" />
          ) : body.trim() ? (
            <Markdown text={body} />
          ) : (
            <p className="text-ink-3">{t("empty")}</p>
          )}
        </Card>
        {showHistory && (
          <History
            slug={slug}
            current={d.revision}
            shown={revision}
            onOpen={onOpenRevision}
          />
        )}
      </div>
    </div>
  );
}
