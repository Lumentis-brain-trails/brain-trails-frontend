"use client";

/**
 * Your media (plan V3, S16-S17): what you uploaded, where it stands, and publication.
 *
 * Media are building blocks, not things one browses to play - the catalog is for that -
 * but they are yours, so opening one plays it back and offers to delete it
 * (`MediaViewer`). A file is checked by the server after upload (backend
 * `media_probe`): it shows as "Checking" until then and refreshes by itself, and a
 * refused file says why. A ready item can be offered to the community; during the beta
 * an admin reviews every request, and a video or audio file needs the author to confirm
 * they may share it. Where an item stands afterwards is a tag under its video: amber
 * "In review" while an admin has it, green "In the community" once it is accepted.
 *
 * "Create a protocol" wraps one item in a protocol of baseline - the item - baseline
 * (V3-0004): everything is played through a protocol, so every session has a version, a
 * stored plan and block events. It opens the new draft, which its author publishes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MediaCard } from "@/components/MediaCard";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import { MediaViewer } from "@/components/MediaViewer";
import { Sheet } from "@/components/Sheet";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
  cn,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { ProtocolDetail } from "@/lib/protocol/catalog";
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

/** Where an item stands, as a pastel pill: amber while in review, green once public. */
function Tag({
  tone,
  children,
}: {
  tone: "review" | "public" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold",
        tone === "review" && "bg-warn-soft text-warn",
        tone === "public" && "bg-ok-soft text-ok",
        tone === "muted" && "bg-surface-2 text-ink-3"
      )}
    >
      {children}
    </span>
  );
}

/** What the server is still doing with the file, or why it refused it. */
function Standing({ item }: { item: Media }) {
  if (item.status === "processing")
    return <p className="type-caption text-ink-3">Checking the file…</p>;
  if (item.status === "failed")
    return (
      <p className="type-caption text-danger">
        {REFUSALS[String(item.probe.reason)] ?? "The file was refused."}
      </p>
    );
  return null;
}

/**
 * The rights step before a publication request: the beta reviews every file, and a
 * video or sound may only be offered by whoever may redistribute it (the backend
 * refuses the request without the attestation).
 */
function ShareDialog({ item, onClose }: { item: Media; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rights, setRights] = useState(false);
  const file = FILE_KINDS.has(item.kind);
  const publish = useMutation({
    mutationFn: () =>
      api.post<Media>(`media/${item.id}/publish`, { rights_attested: rights }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      onClose();
    },
  });
  return (
    <Sheet title="Share with the community" onClose={onClose}>
      <p className="text-ink-2">
        “{item.title}” goes to us for a look first. Once accepted, everyone in
        the community can play it.
      </p>
      {file && (
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-(--accent)"
          />
          I made this file or have the right to share it publicly.
        </label>
      )}
      <div className="mt-5 flex gap-2">
        <Button
          onClick={() => publish.mutate()}
          disabled={publish.isPending || (file && !rights)}
        >
          Ask to publish
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {publish.error instanceof ApiRequestError && (
        <div className="mt-3">
          <ErrorBanner message={publish.error.error.message} />
        </div>
      )}
    </Sheet>
  );
}

/** Under the video: the offer to publish, then the tag it turns into. */
function Share({ item }: { item: Media }) {
  const [asking, setAsking] = useState(false);
  if (item.status !== "ready") return null;
  if (item.visibility !== "workspace")
    return <Tag tone="public">In the community</Tag>;
  if (item.review_state === "pending")
    return <Tag tone="review">In review</Tag>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
          Share with the community
        </Button>
        {item.review_state === "refused" && (
          <Tag tone="muted">Not accepted</Tag>
        )}
      </div>
      {asking && <ShareDialog item={item} onClose={() => setAsking(false)} />}
    </>
  );
}

const WRAPPABLE = new Set(["video", "audio", "text"]);

/** Turn one item into a protocol draft and open it (V3-0004 amendment). */
function MakeProtocol({ item }: { item: Media }) {
  const router = useRouter();
  const create = useMutation({
    mutationFn: () =>
      api.post<ProtocolDetail>(`protocols/from-media/${item.id}`, {}),
    onSuccess: (protocol) => router.push(`/protocols/${protocol.id}`),
  });
  if (!WRAPPABLE.has(item.kind) || item.status !== "ready") return null;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          Create a protocol
        </Button>
      </div>
      {create.error instanceof ApiRequestError && (
        <ErrorBanner message={create.error.error.message} />
      )}
    </div>
  );
}

export default function MediaPage() {
  const [uploading, setUploading] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const workspace = useCurrentWorkspace();
  const mine = useQuery({
    queryKey: ["media", "mine", workspace?.id],
    queryFn: () => api.get<Media[]>(inWorkspace("media?mine=true", workspace)),
    enabled: workspace !== undefined,
    refetchInterval: (query) =>
      query.state.data?.some((i) => i.status === "processing") ? 3000 : false,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">My media</h1>
          <p className="mt-1 text-ink-2">
            Videos and sounds you uploaded. Open one to watch it back; a video
            plays as a protocol from its card.
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {mine.data?.map((item) => (
          <Card key={item.id} inset className="flex flex-col gap-3 p-3">
            <MediaCard
              item={item}
              locked={item.status !== "ready"}
              lockedNote={
                item.status === "failed" ? "Refused" : "Being checked"
              }
              onOpen={
                item.status === "ready" ? () => setWatching(item.id) : undefined
              }
            />
            <Standing item={item} />
            <div className="mt-auto space-y-2">
              <Share item={item} />
              <MakeProtocol item={item} />
            </div>
          </Card>
        ))}
      </div>
      {watching && (
        <MediaViewer id={watching} onClose={() => setWatching(null)} />
      )}
      {uploading && <MediaUploadDialog onClose={() => setUploading(false)} />}
    </main>
  );
}
