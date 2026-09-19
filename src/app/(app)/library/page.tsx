"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import {
  MEDIA_TAGS,
  MEDIA_TAG_HINTS,
  MEDIA_TAG_LABELS,
  mediaAccess,
  mediaTags,
  type Media,
  type MediaTag,
} from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
} from "@/components/ui";

type Row = { key: string; title: string; hint: string; items: Media[] };

/**
 * The library: what you can put your brain inside. One row per browsing tag, plus a row
 * of the user's own uploads, each scrolling sideways.
 *
 * Rows are built from a single catalog request rather than one request per row: the
 * whole visible catalog is tens of items, and one round trip keeps the first paint
 * honest about what exists.
 *
 * `include_locked` is asked for on purpose. Most of the programme is not built yet, and
 * a row of one card reads as a bug rather than a beginning; showing the locked items
 * says what is coming without pretending it is ready. Locked cards cannot be opened, and
 * the backend refuses to start a session against one, so the row is an advertisement and
 * nothing more.
 */
export default function LibraryPage() {
  const [uploading, setUploading] = useState(false);
  const workspace = useCurrentWorkspace();
  const catalog = useQuery({
    queryKey: ["media", "with-locked", workspace?.id],
    queryFn: () =>
      api.get<Media[]>(inWorkspace("media?include_locked=true", workspace)),
    enabled: workspace !== undefined,
    // a rejected session or a bad request will not become valid on retry: fail fast
    // and show the error instead of spinning through three backoffs
    retry: (count, error) =>
      error instanceof ApiRequestError && error.status < 500
        ? false
        : count < 2,
  });
  const items = catalog.data;

  /** Runnable first inside a row, so the one thing a reader can actually start leads. */
  const byAccessThenTitle = (a: Media, b: Media) =>
    mediaAccess(a) === mediaAccess(b)
      ? a.title.localeCompare(b.title)
      : mediaAccess(a) === "open"
        ? -1
        : 1;

  /**
   * True when the catalog came back with no tags anywhere, which means the API predates
   * them rather than that the catalog is empty. Tag rows would all be empty and the page
   * would claim there is nothing in the library, so everything goes in one row instead.
   */
  const untagged =
    !!items &&
    items.length > 0 &&
    items.every((i) => mediaTags(i).length === 0);

  const rows: Row[] = items
    ? [
        ...(untagged
          ? [
              {
                key: "all",
                title: "Everything",
                hint: "Browsing by tag arrives with the next API release.",
                items: [...items].sort(byAccessThenTitle),
              },
            ]
          : MEDIA_TAGS.map((tag: MediaTag) => ({
              key: tag,
              title: MEDIA_TAG_LABELS[tag],
              hint: MEDIA_TAG_HINTS[tag],
              items: items
                .filter((i) => mediaTags(i).includes(tag))
                .sort(byAccessThenTitle),
            }))),
        {
          key: "mine",
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
          text="Upload a video to record against, or ask an admin to publish the first protocol."
          action={
            <Button onClick={() => setUploading(true)}>Upload a video</Button>
          }
        />
      )}

      <div className="flex flex-col gap-10">
        {rows.map((row) => (
          <section key={row.key}>
            <h2 className="type-heading">{row.title}</h2>
            <p className="type-caption mt-0.5 text-ink-3">{row.hint}</p>
            <div className="-mx-6 mt-4 flex gap-4 overflow-x-auto px-6 pb-2">
              {row.items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  locked={mediaAccess(item) === "locked"}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {rows.some((row) =>
        row.items.some((i) => mediaAccess(i) === "locked")
      ) && (
        <p className="type-caption mt-10 text-ink-3">
          Locked protocols are part of the programme but not open yet. Beta
          testers get them first.
        </p>
      )}

      {uploading && <MediaUploadDialog onClose={() => setUploading(false)} />}
    </main>
  );
}
