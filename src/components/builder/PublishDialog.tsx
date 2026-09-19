"use client";

/**
 * Publishing a protocol: the catalog fields, then freeze the draft as the next version.
 *
 * Catalog fields (the card's line, the detail page's description, tags) are not part of
 * a version - fixing a typo in a description must not make a new version of what
 * participants see - so they are saved with `PATCH` first and the publish follows.
 * Publishing validates on the server; its errors land back here rather than in a toast,
 * because they are about the protocol, not about the click.
 */

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, ErrorBanner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { ProtocolDetail } from "@/lib/protocol/catalog";
import { MEDIA_TAGS, MEDIA_TAG_LABELS, type MediaTag } from "@/lib/types";

export function PublishDialog({
  protocol,
  onClose,
  onPublished,
}: {
  protocol: ProtocolDetail;
  onClose: () => void;
  onPublished: (next: ProtocolDetail) => void;
}) {
  const t = useTranslations("builder.publish");
  const [title, setTitle] = useState(protocol.title);
  const [summary, setSummary] = useState(protocol.summary ?? "");
  const [description, setDescription] = useState(protocol.description ?? "");
  const [tags, setTags] = useState<MediaTag[]>(
    (protocol.tags ?? []).filter((tag): tag is MediaTag =>
      (MEDIA_TAGS as readonly string[]).includes(tag)
    )
  );

  const publish = useMutation({
    mutationFn: async () => {
      await api.patch<ProtocolDetail>(`protocols/${protocol.id}`, {
        title,
        summary: summary || null,
        description: description || null,
        tags,
      });
      return api.post<ProtocolDetail>(`protocols/${protocol.id}/publish`, {});
    },
    onSuccess: onPublished,
  });

  const issues =
    publish.error instanceof ApiRequestError
      ? ((publish.error.error as { details?: { errors?: { message: string }[] } })
          .details?.errors ?? [])
      : [];

  return (
    <Sheet onClose={onClose} title={t("title")}>
      <div className="space-y-4">
        <Field label={t("name")}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2"
          />
        </Field>
        <Field label={t("summary")} hint={t("summary_hint")}>
          <input
            value={summary}
            maxLength={200}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2"
          />
        </Field>
        <Field label={t("description")}>
          <textarea
            value={description}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2"
          />
        </Field>
        <Field label={t("tags")}>
          <div className="flex flex-wrap gap-2">
            {MEDIA_TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-1 text-[14px]">
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={(event) =>
                    setTags((current) =>
                      event.target.checked
                        ? [...current, tag]
                        : current.filter((c) => c !== tag)
                    )
                  }
                />
                {MEDIA_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </Field>

        {publish.isError && (
          <div className="space-y-2">
            <ErrorBanner
              message={
                issues.length > 0
                  ? t("invalid")
                  : publish.error instanceof ApiRequestError
                    ? publish.error.error.message
                    : t("failed")
              }
            />
            <ul className="space-y-1 text-[14px] text-danger">
              {issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            {protocol.current_version === null
              ? t("publish")
              : t("publish_version", { version: protocol.current_version + 1 })}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[14px] font-medium">{label}</span>
      {children}
      {hint && <span className="type-caption block text-ink-3">{hint}</span>}
    </label>
  );
}
