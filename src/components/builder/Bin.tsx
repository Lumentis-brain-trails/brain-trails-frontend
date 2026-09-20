"use client";

/**
 * The builder's bin: what can be dropped on the timeline (sprint S19).
 *
 * Tab *Media* is the library seen from inside the builder - yours first, then what the
 * community and the official catalog offer - with a search box and an upload that stays
 * in place, because leaving the builder to add a clip is how an edit gets lost. Tab
 * *Elements* holds the blocks that ask nothing of the participant (instructions,
 * fixation, baseline, rest, countdown) or only how they feel (a questionnaire); tab
 * *Tasks* holds the ones that record what the participant does - the games. It is the
 * line the backend draws too: a task block is one whose trials it scores.
 *
 * Nothing here mutates the draft: an item is dragged, and the timeline decides where it
 * lands (`DragPayload`).
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import { KindCover } from "@/components/builder/KindCover";
import { setDragPayload } from "@/components/builder/Timeline";
import { Button, Icon, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { ELEMENTS, formatClock } from "@/lib/builder/draft";
import { identityOf } from "@/lib/builder/kinds";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import type { Media } from "@/lib/types";

/** Media kinds a protocol can play as a block. */
const PLAYABLE = new Set(["video", "audio", "text"]);

export function Bin({
  onAdd,
  onAddElement,
}: {
  onAdd: (item: Media) => void;
  /** Double-click on an element appends it, as it does for media. */
  onAddElement: (kind: string) => void;
}) {
  const t = useTranslations("builder.bin");
  const [tab, setTab] = useState<"media" | "elements" | "tasks">("media");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const workspace = useCurrentWorkspace();

  const mine = useQuery({
    queryKey: ["media", "mine", workspace?.id],
    queryFn: () => api.get<Media[]>(inWorkspace("media?mine=true", workspace)),
    enabled: workspace !== undefined,
  });
  const shared = useQuery({
    queryKey: ["media", "catalog"],
    queryFn: () => api.get<Media[]>("media?limit=100"),
  });

  const items = [...(mine.data ?? []), ...(shared.data ?? [])]
    .filter(
      (item, index, all) => all.findIndex((i) => i.id === item.id) === index
    )
    .filter((item) => PLAYABLE.has(item.kind) && item.status === "ready")
    .filter((item) =>
      query ? item.title.toLowerCase().includes(query.toLowerCase()) : true
    );

  return (
    <aside className="flex h-full min-h-0 w-[280px] shrink-0 flex-col gap-3 border-r border-hairline p-3">
      <div role="tablist" aria-label={t("title")} className="flex gap-1">
        {(["media", "elements", "tasks"] as const).map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              "pressable rounded-full px-3 py-1 text-[13px] font-medium",
              tab === name ? "bg-surface-2 text-ink" : "text-ink-2"
            )}
          >
            {t(name)}
          </button>
        ))}
      </div>

      {tab === "media" ? (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-8 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-[13px]"
          />
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
            {(mine.isPending || shared.isPending) && (
              <Skeleton className="h-16 w-full" />
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(event) =>
                  setDragPayload(event, { from: "bin-media", value: item.id })
                }
                onDoubleClick={() => onAdd(item)}
                title={item.title}
                className="block w-full cursor-grab rounded-[var(--radius-control)] border border-hairline bg-surface p-1.5 text-left hover:border-accent/50"
              >
                <KindCover kind={item.kind} image={item.cover_url} />
                <span className="mt-1.5 block truncate px-0.5 text-[12px] font-medium">
                  {item.title}
                </span>
                <span className="type-caption block px-0.5 text-ink-3">
                  {identityOf(item.kind).label}
                  {item.duration_s ? ` · ${formatClock(item.duration_s)}` : ""}
                </span>
              </button>
            ))}
            {items.length === 0 && !mine.isPending && (
              <p className="type-caption col-span-2 text-ink-3">
                {t("no_media")}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setUploading(true)}
          >
            <Icon name="plus" /> {t("upload")}
          </Button>
          {uploading && (
            <MediaUploadDialog onClose={() => setUploading(false)} />
          )}
        </>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
          {ELEMENTS.filter(
            (element) =>
              element.group === (tab === "tasks" ? "task" : "element")
          ).map((element) => (
            <button
              key={element.id}
              type="button"
              draggable
              onDragStart={(event) =>
                setDragPayload(event, {
                  from: "bin-element",
                  value: element.id,
                })
              }
              onDoubleClick={() => onAddElement(element.id)}
              title={element.hint ?? identityOf(element.kind).hint}
              className="block w-full cursor-grab rounded-[var(--radius-control)] border border-hairline bg-surface p-1.5 text-left hover:border-accent/50"
            >
              <KindCover kind={element.kind} />
              <span className="mt-1.5 block px-0.5 text-[12px] leading-tight font-medium">
                {element.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
