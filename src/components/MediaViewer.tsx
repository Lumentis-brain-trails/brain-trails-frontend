"use client";

/**
 * What one of your own uploads is: watch it back, see where it stands, delete it.
 *
 * The list does not carry playable links - `GET /media` leaves `url` out - so the
 * viewer fetches the item itself for its short-lived S3 links, and lets the file play
 * with controls (the card only loops the muted 6 s preview).
 *
 * Delete is not always a delete: an item played by a published protocol version is
 * archived instead, so past sessions keep replaying what they showed (backend
 * `DELETE /media/{id}`). The usage call tells the reader which of the two will happen
 * before they confirm, rather than surprising them with the result.
 *
 * Sharing is reversible here too: what was offered to the community can be taken back,
 * and a request still waiting can be cancelled (`POST /media/{id}/unpublish`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, ErrorBanner, KeyValue, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { Media } from "@/lib/types";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes >= 1 ? `${minutes} min ${rest} s` : `${Math.round(seconds)} s`;
}

/** The item itself, played with controls - or its text, or nothing to play. */
function Player({ item }: { item: Media }) {
  const t = useTranslations("media.viewer");
  const frame =
    "w-full rounded-[var(--radius-card)] border border-hairline bg-black";
  if (item.kind === "video")
    return item.url ? (
      <video
        src={item.url}
        poster={item.cover_url ?? undefined}
        controls
        playsInline
        className={`${frame} aspect-video`}
      />
    ) : (
      <p className="type-caption text-ink-3">{t("noVideoFile")}</p>
    );
  if (item.kind === "audio")
    return (
      <div className="space-y-3">
        {item.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a known host
          <img
            src={item.cover_url}
            alt=""
            className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline object-cover"
          />
        )}
        {item.url ? (
          <audio src={item.url} controls className="w-full" />
        ) : (
          <p className="type-caption text-ink-3">{t("noAudioFile")}</p>
        )}
      </div>
    );
  if (item.kind === "text" && typeof item.definition.body === "string")
    return (
      <div className="max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-hairline bg-surface-2 p-4 text-pretty text-ink-2">
        {item.definition.body}
      </div>
    );
  return <p className="type-caption text-ink-3">{t("nothingToWatch")}</p>;
}

export function MediaViewer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const t = useTranslations("media.viewer");
  const locale = useFormatLocale();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const item = useQuery({
    queryKey: ["media", "item", id],
    queryFn: () => api.get<Media>(`media/${id}`),
  });
  const usage = useQuery({
    queryKey: ["media", "usage", id],
    queryFn: () => api.get<{ protocols: string[] }>(`media/${id}/usage`),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<{ status: string }>(`media/${id}`),
    onSuccess: (result) => {
      toast(
        "success",
        result.status === "archived" ? t("toast.archived") : t("toast.deleted")
      );
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      onClose();
    },
  });

  const withdraw = useMutation({
    mutationFn: () => api.post<Media>(`media/${id}/unpublish`, {}),
    onSuccess: (updated) => {
      toast(
        "success",
        updated.review_state === "none" && updated.visibility === "workspace"
          ? t("toast.takenBack")
          : t("toast.done")
      );
      void queryClient.invalidateQueries({ queryKey: ["media"] });
    },
  });

  const played = usage.data ? usage.data.protocols.length : 0;
  const waiting = item.data?.review_state === "pending";
  const shared =
    item.data !== undefined && item.data.visibility !== "workspace";

  return (
    <Sheet
      title={item.data?.title ?? t("fallbackTitle")}
      onClose={onClose}
      className="sm:max-w-2xl"
    >
      {item.isPending && <Skeleton className="aspect-video w-full" />}
      {item.isError && <ErrorBanner message={t("loadError")} />}
      {item.data && (
        <div className="space-y-4">
          <Player item={item.data} />
          {item.data.description && (
            <p className="text-pretty text-ink-2">{item.data.description}</p>
          )}
          <div className="rounded-[var(--radius-card)] border border-hairline">
            <KeyValue
              label={t("length")}
              value={formatDuration(item.data.duration_s)}
            />
            <KeyValue
              label={t("uploaded")}
              value={new Date(item.data.created_at).toLocaleDateString(locale)}
            />
            <KeyValue
              label={t("shared")}
              value={
                item.data.visibility === "workspace"
                  ? item.data.review_state === "pending"
                    ? t("sharedValue.inReview")
                    : t("sharedValue.onlyYou")
                  : t("sharedValue.community")
              }
            />
          </div>
          {confirming ? (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface-2 p-4">
              <p className="text-ink-2">
                {played > 0
                  ? t("confirm.archive", { count: played })
                  : t("confirm.delete")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  {played > 0 ? t("confirm.archiveIt") : t("confirm.deleteIt")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {t("confirm.keep")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {(shared || waiting) && (
                <Button
                  variant="ghost"
                  onClick={() => withdraw.mutate()}
                  disabled={withdraw.isPending}
                >
                  {waiting ? t("cancelRequest") : t("takeBack")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                {t("delete")}
              </Button>
            </div>
          )}
          {shared && (
            <p className="type-caption text-ink-3">{t("takeBackNote")}</p>
          )}
          {remove.error && <ErrorBanner message={errorMessage(remove.error)} />}
          {withdraw.error && (
            <ErrorBanner message={errorMessage(withdraw.error)} />
          )}
        </div>
      )}
    </Sheet>
  );
}
