"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef } from "react";
import type { Media } from "@/lib/types";
import { Icon, cn } from "@/components/ui";

/** Cover stand-in for items without an image: a stable hue per slug, so a card is recognisable. */
function hueOf(slug: string): number {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 1 ? `${minutes} min` : `${Math.round(seconds)} s`;
}

/**
 * One catalog tile. The cover fills the card's width (the tile is as wide as its
 * column, never a fixed 228 px), the kind and duration sit under the title, and a
 * scenario's content warning is shown here rather than only at start: the reader
 * decides before they commit (decision V2-0002). A file with a preview clip plays it
 * muted on hover, so the card shows the video itself and not only a frame.
 *
 * `onOpen` makes the tile a button instead of a link: "My media" opens its own viewer
 * (watch it back, delete it) rather than sending the reader to a protocol page.
 * `lockedNote` says why it cannot be opened - the catalog locks items behind the beta
 * (the default, "Beta testers only" in the reader's language), "My media" locks an
 * upload the server has not finished checking. The caller passes it already translated.
 *
 * A locked item is a different thing and looks like one: desaturated, badged with a
 * padlock, and not a link at all. Rendering it as a disabled anchor would leave it
 * focusable and clickable-looking; there is nowhere for it to go, so it is a plain
 * element with `aria-disabled` and the reason in its accessible name.
 */
export function MediaCard({
  item,
  locked = false,
  lockedNote,
  onOpen,
}: {
  item: Media;
  locked?: boolean;
  lockedNote?: string;
  onOpen?: () => void;
}) {
  const t = useTranslations("media.card");
  const note = lockedNote ?? t("betaOnly");
  // The kind is a code from the API: one this catalogue has no word for shows no badge
  // text, as an unknown kind did before the words moved here.
  const kindKey = `kinds.${item.kind}`;
  const preview = useRef<HTMLVideoElement>(null);
  const duration = formatDuration(
    item.duration_s ?? item.manifest.expected_duration_s
  );
  const warning = item.manifest.content_warning;
  const hue = hueOf(item.slug);

  const cover = (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-hairline",
        "bg-surface-2",
        locked
          ? "opacity-55 grayscale"
          : "transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-(--shadow-card)"
      )}
      style={
        item.cover_url
          ? undefined
          : {
              background: `linear-gradient(135deg, hsl(${hue} 62% 62%), hsl(${(hue + 48) % 360} 68% 52%))`,
            }
      }
    >
      {item.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a known host
        <img
          src={item.cover_url}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      {item.preview_url && !locked && (
        <video
          ref={preview}
          src={item.preview_url}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
      {locked ? (
        <span className="material-glass absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
          <Icon name="lock" className="h-3 w-3" /> {t("locked")}
        </span>
      ) : (
        <span className="material-glass absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
          {t.has(kindKey as never) ? t(kindKey as never) : null}
        </span>
      )}
      {item.mine && !locked && (
        <span className="material-glass absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
          {t("yours")}
        </span>
      )}
    </div>
  );

  const title = (
    <h3
      className={cn(
        "mt-2 truncate text-[15px] font-semibold",
        locked && "text-ink-2"
      )}
    >
      {item.title}
    </h3>
  );

  const caption = (
    <p className="type-caption truncate text-ink-3">
      {[duration, warning ? t("contentWarning") : null]
        .filter(Boolean)
        .join(" · ") || " "}
    </p>
  );

  if (locked) {
    return (
      <div
        className="w-full"
        aria-disabled="true"
        aria-label={t("lockedLabel", { title: item.title, note })}
      >
        {cover}
        {title}
        <p className="type-caption truncate text-ink-3">{note}</p>
      </div>
    );
  }

  const hover = {
    onMouseEnter: () => void preview.current?.play().catch(() => {}),
    onMouseLeave: () => preview.current?.pause(),
  };

  if (onOpen)
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("open", { title: item.title })}
        className="pressable group block w-full text-left focus-visible:outline-none"
        {...hover}
      >
        {cover}
        {title}
        {caption}
      </button>
    );

  return (
    <Link
      href={`/protocols/${item.id}`}
      className="pressable group block w-full focus-visible:outline-none"
      {...hover}
    >
      {cover}
      {title}
      {caption}
    </Link>
  );
}
