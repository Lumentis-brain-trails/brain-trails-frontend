"use client";

/**
 * The builder's bin: what can be dropped on the timeline (sprint S19).
 *
 * Tab *Media* is the library seen from inside the builder - yours first, then what the
 * community and the official catalog offer - with a search box and an upload that stays
 * in place, because leaving the builder to add a clip is how an edit gets lost. Tab
 * *Elements* holds the blocks that are not media: instructions, fixation, baseline,
 * rest, countdown, a questionnaire.
 *
 * Nothing here mutates the draft: an item is dragged, and the timeline decides where it
 * lands (`DragPayload`).
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import { DRAG_TYPE } from "@/components/builder/Timeline";
import { Button, Icon, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { ELEMENTS } from "@/lib/builder/draft";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import type { Media } from "@/lib/types";

/** Media kinds a protocol can play as a block. */
const PLAYABLE = new Set(["video", "audio", "text"]);

export function Bin({ onAdd }: { onAdd: (item: Media) => void }) {
  const t = useTranslations("builder.bin");
  const [tab, setTab] = useState<"media" | "elements">("media");
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
    .filter((item, index, all) => all.findIndex((i) => i.id === item.id) === index)
    .filter((item) => PLAYABLE.has(item.kind) && item.status === "ready")
    .filter((item) =>
      query ? item.title.toLowerCase().includes(query.toLowerCase()) : true
    );

  return (
    <aside className="flex h-full min-h-0 w-[260px] shrink-0 flex-col gap-3 border-r border-hairline p-3">
      <div role="tablist" aria-label={t("title")} className="flex gap-1">
        {(["media", "elements"] as const).map((name) => (
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
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {(mine.isPending || shared.isPending) && (
              <Skeleton className="h-16 w-full" />
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    DRAG_TYPE,
                    JSON.stringify({ from: "bin-media", value: item.id })
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onDoubleClick={() => onAdd(item)}
                className="block w-full cursor-grab rounded-[var(--radius-control)] border border-hairline bg-surface p-2 text-left hover:border-accent/50"
              >
                <span className="block truncate text-[13px] font-medium">
                  {item.title}
                </span>
                <span className="type-caption text-ink-3">
                  {item.kind}
                  {item.duration_s
                    ? ` · ${Math.round(item.duration_s)} s`
                    : ""}
                </span>
              </button>
            ))}
            {items.length === 0 && !mine.isPending && (
              <p className="type-caption text-ink-3">{t("no_media")}</p>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>
            <Icon name="plus" /> {t("upload")}
          </Button>
          {uploading && (
            <MediaUploadDialog onClose={() => setUploading(false)} />
          )}
        </>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {ELEMENTS.map((element) => (
            <button
              key={element.kind}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  DRAG_TYPE,
                  JSON.stringify({ from: "bin-element", value: element.kind })
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
              className="block w-full cursor-grab rounded-[var(--radius-control)] border border-hairline bg-surface p-2 text-left hover:border-accent/50"
            >
              <span className="block text-[13px] font-medium">
                {element.label}
              </span>
              <span className="type-caption text-ink-3">{element.kind}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
