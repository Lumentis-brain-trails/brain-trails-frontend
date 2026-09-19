"use client";

/**
 * Your media (plan V3, S16-S17): what you uploaded, where it stands, and publication.
 *
 * Media are building blocks, not things one browses to play - the catalog is for that.
 * A file is checked by the server after upload (backend `media_probe`): it shows as
 * "Checking" until then and refreshes by itself, and a refused file says why. A ready
 * item can be offered to the community; during the beta an admin reviews every request,
 * and a video or audio file needs the author to confirm they may share it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaCard } from "@/components/MediaCard";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { Media } from "@/lib/types";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";

const REFUSALS: Record<string, string> = {
  unreadable: "The file could not be read.",
  no_video_stream: "The file has no video in it.",
  no_audio_stream: "The file has no audio in it.",
  unsupported_video_codec:
    "Browsers cannot play this video format. Export it as H.264 (MP4) or VP9 (WebM).",
  unsupported_audio_codec:
    "Browsers cannot play this audio format. Export it as AAC, MP3 or Opus.",
  no_duration: "The file has no length.",
  probe_error: "The check failed. Try uploading it again.",
};

const FILE_KINDS = new Set(["video", "audio"]);

function Standing({ item }: { item: Media }) {
  if (item.status === "processing")
    return <p className="type-caption text-ink-3">Checking the file…</p>;
  if (item.status === "failed")
    return (
      <p className="type-caption text-danger">
        {REFUSALS[String(item.probe.reason)] ?? "The file was refused."}
      </p>
    );
  if (item.visibility === "public")
    return <p className="type-caption text-ink-3">In the community</p>;
  if (item.review_state === "pending")
    return <p className="type-caption text-ink-3">Waiting for review</p>;
  if (item.review_state === "refused")
    return (
      <p className="type-caption text-ink-3">Not accepted for publication</p>
    );
  return null;
}

function Publish({ item }: { item: Media }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [rights, setRights] = useState(false);
  const file = FILE_KINDS.has(item.kind);
  const publish = useMutation({
    mutationFn: () =>
      api.post<Media>(`media/${item.id}/publish`, { rights_attested: rights }),
    onSuccess: () => {
      setAsking(false);
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
  });
  if (
    item.status !== "ready" ||
    item.visibility !== "workspace" ||
    item.review_state === "pending"
  )
    return null;
  if (!asking)
    return (
      <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
        Share with the community
      </Button>
    );
  return (
    <div className="space-y-2">
      {file && (
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-(--accent)"
          />
          I made this file or have the right to share it publicly.
        </label>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => publish.mutate()}
          disabled={publish.isPending || (file && !rights)}
        >
          Ask to publish
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
      {publish.error instanceof ApiRequestError && (
        <ErrorBanner message={publish.error.error.message} />
      )}
    </div>
  );
}

export default function MediaPage() {
  const [uploading, setUploading] = useState(false);
  const workspace = useCurrentWorkspace();
  const mine = useQuery({
    queryKey: ["media", "mine", workspace?.id],
    queryFn: () => api.get<Media[]>(inWorkspace("media?mine=true", workspace)),
    enabled: workspace !== undefined,
    refetchInterval: (query) =>
      query.state.data?.some((i) => i.status === "processing") ? 3000 : false,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Your media</h1>
          <p className="mt-1 text-ink-2">
            Videos and sounds you uploaded. A video plays as a protocol from its
            card.
          </p>
        </div>
        <Button onClick={() => setUploading(true)}>
          <Icon name="plus" /> Upload
        </Button>
      </header>
      {mine.isPending && <Skeleton className="h-40" />}
      {mine.isError && (
        <ErrorBanner message="Your media could not be loaded." />
      )}
      {mine.data?.length === 0 && (
        <EmptyState
          title="Nothing uploaded yet"
          text="Upload a video or a sound to build protocols with."
          action={<Button onClick={() => setUploading(true)}>Upload</Button>}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-6">
        {mine.data?.map((item) => (
          <Card key={item.id} inset className="space-y-3 p-3">
            <MediaCard item={item} locked={item.status !== "ready"} />
            <Standing item={item} />
            <Publish item={item} />
          </Card>
        ))}
      </div>
      {uploading && <MediaUploadDialog onClose={() => setUploading(false)} />}
    </main>
  );
}
