"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { Media } from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
} from "@/components/ui";

type Row = { title: string; hint: string; items: Media[] };

/**
 * The library: what you can put your brain inside. One row per kind, plus a row of
 * the user's own uploads, each scrolling sideways.
 *
 * Rows are built from a single catalog request rather than one request per row: the
 * whole visible catalog is tens of items, and one round trip keeps the first paint
 * honest about what exists.
 */
export default function LibraryPage() {
  const [uploading, setUploading] = useState(false);
  const catalog = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<Media[]>("media"),
    // a rejected session or a bad request will not become valid on retry: fail fast
    // and show the error instead of spinning through three backoffs
    retry: (count, error) =>
      error instanceof ApiRequestError && error.status < 500
        ? false
        : count < 2,
  });
  const items = catalog.data;

  const rows: Row[] = items
    ? [
        {
          title: "Games",
          hint: "Built for neuromodulation: short, repeatable, measurable.",
          items: items.filter((i) => i.kind === "game"),
        },
        {
          title: "Scenarios",
          hint: "Choices with a cost. Your reaction is the measurement.",
          items: items.filter((i) => i.kind === "scenario"),
        },
        {
          title: "Videos",
          hint: "Watch something and see what your brain did with it.",
          items: items.filter((i) => i.kind === "video" && !i.mine),
        },
        {
          title: "Your uploads",
          hint: "Private to you.",
          items: items.filter((i) => i.kind === "video" && i.mine),
        },
      ].filter((row) => row.items.length > 0)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Library</h1>
          <p className="mt-1 text-ink-2">
            Pick what to do while you record. Your EEG runs alongside it.
          </p>
        </div>
        <Button onClick={() => setUploading(true)}>
          <Icon name="plus" /> Upload a video
        </Button>
      </header>

      {catalog.isPending && (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-[228px] shrink-0">
              <Skeleton className="aspect-video w-full rounded-[var(--radius-card)]" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {catalog.isError && (
        <ErrorBanner message="The library could not be loaded. Reload the page, or sign in again." />
      )}

      {items && rows.length === 0 && (
        <EmptyState
          title="Nothing in the library yet"
          text="Upload a video to record against, or ask an admin to publish the first game."
          action={
            <Button onClick={() => setUploading(true)}>Upload a video</Button>
          }
        />
      )}

      <div className="flex flex-col gap-10">
        {rows.map((row) => (
          <section key={row.title}>
            <h2 className="type-heading">{row.title}</h2>
            <p className="type-caption mt-0.5 text-ink-3">{row.hint}</p>
            <div className="-mx-6 mt-4 flex gap-4 overflow-x-auto px-6 pb-2">
              {row.items.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {uploading && <MediaUploadDialog onClose={() => setUploading(false)} />}
    </main>
  );
}
