"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  type ProtocolCard as Card,
  formatMinutes,
  isPlayable,
} from "@/lib/protocol/catalog";
import { Icon, cn } from "@/components/ui";

/** Cover stand-in for protocols without an image: a stable hue per slug. */
function hueOf(slug: string): number {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

/**
 * One catalog tile (V3-0004, S18): cover, a short muted preview on hover, title,
 * one-line summary, duration. The whole card is the link to the detail page, where Play
 * lives; the content warning is shown here too, so the reader decides before they
 * commit (V2-0002).
 *
 * A locked protocol is advertised, not runnable, and looks like it: desaturated,
 * badged with a padlock, and a plain element with `aria-disabled` rather than a link.
 */
export function ProtocolCard({ item }: { item: Card }) {
  const preview = useRef<HTMLVideoElement>(null);
  const locked = item.access === "locked";
  const draft = item.current_version === null;
  const duration = formatMinutes(item.est_duration_s);
  const hue = hueOf(item.slug);

  const cover = (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface-2",
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
      <span className="material-glass absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
        {locked ? (
          <>
            <Icon name="lock" className="h-3 w-3" /> Locked
          </>
        ) : item.visibility === "official" ? (
          "Official"
        ) : item.visibility === "public" ? (
          "Community"
        ) : draft ? (
          "Draft"
        ) : (
          "Yours"
        )}
      </span>
    </div>
  );

  const text = (
    <>
      <h3
        className={cn(
          "mt-2 truncate text-[15px] font-semibold",
          locked && "text-ink-2"
        )}
      >
        {item.title}
      </h3>
      <p className="type-caption truncate text-ink-3">
        {locked
          ? "Beta testers only"
          : [duration, item.summary].filter(Boolean).join(" · ") || " "}
      </p>
      {item.content_warning && !locked && (
        <p className="type-caption mt-0.5 truncate text-warn">
          {item.content_warning}
        </p>
      )}
    </>
  );

  if (locked)
    return (
      <div
        className="w-[228px] shrink-0"
        aria-disabled="true"
        aria-label={`${item.title} — locked, available to beta testers`}
      >
        {cover}
        {text}
      </div>
    );

  return (
    <Link
      href={`/protocols/${item.id}`}
      className="pressable group block w-[228px] shrink-0 focus-visible:outline-none"
      onMouseEnter={() => void preview.current?.play().catch(() => {})}
      onMouseLeave={() => preview.current?.pause()}
      data-playable={isPlayable(item) || undefined}
    >
      {cover}
      {text}
    </Link>
  );
}
