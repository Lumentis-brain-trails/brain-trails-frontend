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
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, ErrorBanner, KeyValue, Skeleton } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { Media } from "@/lib/types";

const errorText = (e: unknown) =>
  e instanceof ApiRequestError
    ? e.error.message
    : e instanceof Error
      ? e.message
      : "Something went wrong.";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes >= 1 ? `${minutes} min ${rest} s` : `${Math.round(seconds)} s`;
}

/** The item itself, played with controls - or its text, or nothing to play. */
function Player({ item }: { item: Media }) {
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
      <p className="type-caption text-ink-3">This video has no file yet.</p>
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
          <p className="type-caption text-ink-3">This sound has no file yet.</p>
        )}
      </div>
    );
  if (item.kind === "text" && typeof item.definition.body === "string")
    return (
      <div className="max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-hairline bg-surface-2 p-4 text-pretty text-ink-2">
        {item.definition.body}
      </div>
    );
  return (
    <p className="type-caption text-ink-3">
      This item is played inside a protocol; there is nothing to watch here.
    </p>
  );
}

export function MediaViewer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
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
        result.status === "archived"
          ? "Archived: the protocols that play it keep it."
          : "Deleted."
      );
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      onClose();
    },
  });

  const played = usage.data ? usage.data.protocols.length : 0;

  return (
    <Sheet
      title={item.data?.title ?? "Your media"}
      onClose={onClose}
      className="sm:max-w-2xl"
    >
      {item.isPending && <Skeleton className="aspect-video w-full" />}
      {item.isError && <ErrorBanner message="This item could not be loaded." />}
      {item.data && (
        <div className="space-y-4">
          <Player item={item.data} />
          {item.data.description && (
            <p className="text-pretty text-ink-2">{item.data.description}</p>
          )}
          <div className="rounded-[var(--radius-card)] border border-hairline">
            <KeyValue
              label="Length"
              value={formatDuration(item.data.duration_s)}
            />
            <KeyValue
              label="Uploaded"
              value={new Date(item.data.created_at).toLocaleDateString()}
            />
            <KeyValue
              label="Shared"
              value={
                item.data.visibility === "workspace"
                  ? item.data.review_state === "pending"
                    ? "In review"
                    : "Only you"
                  : "In the community"
              }
            />
          </div>
          {confirming ? (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface-2 p-4">
              <p className="text-ink-2">
                {played > 0
                  ? `${played === 1 ? "A protocol plays" : `${played} protocols play`} this item: it leaves your media but keeps playing there, and your past sessions are unaffected.`
                  : "This deletes the file for good. Your past sessions are unaffected."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  {played > 0 ? "Archive it" : "Delete it"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            </div>
          )}
          {remove.error && <ErrorBanner message={errorText(remove.error)} />}
        </div>
      )}
    </Sheet>
  );
}
