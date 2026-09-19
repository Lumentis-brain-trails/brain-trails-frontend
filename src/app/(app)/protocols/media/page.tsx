"use client";

/**
 * Your media (plan V3, S16): the files you uploaded, and the way to add one.
 *
 * Media are building blocks, not things one browses to play - the catalog is for that.
 * This page is the page form of the builder's media bin; S17 gives it kinds, circles and
 * publication, S19 embeds it in the builder. A video uploaded here already plays as a
 * one-block protocol from its card.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MediaCard } from "@/components/MediaCard";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { Media } from "@/lib/types";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";

export default function MediaPage() {
  const [uploading, setUploading] = useState(false);
  const workspace = useCurrentWorkspace();
  const mine = useQuery({
    queryKey: ["media", "mine", workspace?.id],
    queryFn: () => api.get<Media[]>(inWorkspace("media?mine=true", workspace)),
    enabled: workspace !== undefined,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Your media</h1>
          <p className="mt-1 text-ink-2">
            Videos you uploaded. Each one plays as a protocol from its card.
          </p>
        </div>
        <Button onClick={() => setUploading(true)}>
          <Icon name="plus" /> Upload a video
        </Button>
      </header>
      {mine.isPending && <Skeleton className="h-40" />}
      {mine.isError && (
        <ErrorBanner message="Your media could not be loaded." />
      )}
      {mine.data?.length === 0 && (
        <EmptyState
          title="Nothing uploaded yet"
          text="Upload a video to record against."
          action={
            <Button onClick={() => setUploading(true)}>Upload a video</Button>
          }
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-4">
        {mine.data?.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>
      {uploading && <MediaUploadDialog onClose={() => setUploading(false)} />}
    </main>
  );
}
