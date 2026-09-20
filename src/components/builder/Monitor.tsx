"use client";

/**
 * The builder's monitor: a still of what the participant sees in the selected block.
 *
 * A video shows its cover (and its short muted preview clip when it has one); a block
 * that is words shows those words on the participant's dark stage; a game or any other
 * kind shows its cover frame, which stays still - the game itself only runs in Preview,
 * where it has the whole screen and its real timing.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { KindCover } from "@/components/builder/KindCover";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import type { Media } from "@/lib/types";
import { type BinMedia, type Clip, formatClock } from "@/lib/builder/draft";
import { identityOf } from "@/lib/builder/kinds";

/** The words a block puts on screen, when it is a block of words. */
function wordsOf(kind: string, config: Record<string, unknown>): string | null {
  if (kind === "instructions" || kind === "prompt") {
    const lines = config.lines;
    if (Array.isArray(lines)) {
      const first = lines[0] as { text?: unknown } | undefined;
      if (typeof first?.text === "string") return first.text;
    }
  }
  if (kind === "rest" && typeof config.message === "string")
    return config.message;
  if (kind === "text" && typeof config.body === "string")
    return config.body.slice(0, 280);
  if (kind === "questionnaire" && typeof config.prompt === "string")
    return config.prompt || null;
  return null;
}

export function Monitor({
  clip,
  media,
  onPlay,
  onSplit,
}: {
  /** The clip to show: the selected one, or the first when nothing is selected. */
  clip: Clip | undefined;
  media: Record<string, BinMedia>;
  /** Run the whole protocol full screen, without a headband. */
  onPlay: () => void;
  /** Cut the shown video in two at this media second. */
  onSplit?: (atS: number) => void;
}) {
  const t = useTranslations("builder.monitor");
  const player = useRef<HTMLVideoElement>(null);
  const shownConfig = (
    clip?.node.type === "block" ? clip.node.config : {}
  ) as Record<string, unknown>;
  const videoId =
    clip?.node.type === "block" &&
    clip.node.kind === "video" &&
    typeof shownConfig.media_id === "string"
      ? shownConfig.media_id
      : null;
  // The list links stills only; the file itself is one request, made for the clip shown.
  const file = useQuery({
    queryKey: ["media", videoId, "file"],
    queryFn: () => api.get<Media>(`media/${videoId}`),
    enabled: videoId !== null,
    staleTime: 10 * 60_000,
  });
  if (!clip)
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-card)] bg-black p-6 text-center">
        <p className="type-caption text-white/60">{t("empty")}</p>
      </div>
    );

  const node = clip.node;
  const isBlock = node.type === "block";
  const kind = isBlock ? node.kind : "group";
  const config = (isBlock ? node.config : {}) as Record<string, unknown>;
  const item =
    typeof config.media_id === "string" ? media[config.media_id] : undefined;
  const words = isBlock ? wordsOf(kind, config) : null;
  const start = typeof config.start_s === "number" ? config.start_s : 0;
  const end = typeof config.end_s === "number" ? config.end_s : undefined;
  const trimmed = start > 0 || end !== undefined;
  const identity = identityOf(kind);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-black">
        {videoId && file.data?.url ? (
          <video
            ref={player}
            // the clip's own stretch: the browser opens and stops the file at its ends
            key={`${file.data.url}#${start}-${end ?? ""}`}
            src={`${file.data.url}#t=${start}${end !== undefined ? `,${end}` : ""}`}
            poster={item?.cover_url ?? undefined}
            controls
            playsInline
            className="aspect-video w-full"
          />
        ) : words ? (
          <div className="flex aspect-video w-full items-center justify-center p-8">
            <p className="max-w-[36ch] text-center text-[clamp(14px,1.6vw,22px)] leading-snug whitespace-pre-line text-white">
              {words}
            </p>
          </div>
        ) : (
          <KindCover
            kind={kind}
            image={item?.cover_url}
            className="rounded-none"
          />
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: identity.tone }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{clip.label}</p>
          <p className="type-caption truncate text-ink-3">
            {isBlock ? identity.label : t("group")} · {clip.variable ? "~" : ""}
            {formatClock(clip.seconds)}
            {trimmed
              ? ` · ${t("trimmed", {
                  from: formatClock(start),
                  to: end !== undefined ? formatClock(end) : t("the_end"),
                })}`
              : isBlock && identity.hint
                ? ` · ${identity.hint}`
                : ""}
          </p>
        </div>
        {videoId && onSplit && (
          <Button
            size="sm"
            variant="secondary"
            title={t("split_hint")}
            onClick={() => {
              if (player.current) onSplit(player.current.currentTime);
            }}
          >
            {t("split")}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onPlay}>
          {t("play")}
        </Button>
      </div>
    </div>
  );
}
