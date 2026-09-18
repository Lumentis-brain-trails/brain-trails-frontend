import Link from "next/link";
import type { Media } from "@/lib/types";
import { cn } from "@/components/ui";

const KIND_LABEL: Record<Media["kind"], string> = {
  video: "Video",
  game: "Game",
  scenario: "Scenario",
};

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
 * One catalog tile. The whole card is the link, the kind and duration sit under the
 * title, and a scenario's content warning is shown here rather than only at start:
 * the reader decides before they commit (decision V2-0002).
 */
export function MediaCard({ item }: { item: Media }) {
  const duration = formatDuration(
    item.duration_s ?? item.manifest.expected_duration_s
  );
  const warning = item.manifest.content_warning;
  const hue = hueOf(item.slug);

  return (
    <Link
      href={`/library/${item.id}`}
      className="pressable group block w-[228px] shrink-0 focus-visible:outline-none"
    >
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] border border-hairline",
          "bg-surface-2 transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-(--shadow-card)"
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
        <span className="material-glass absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
          {KIND_LABEL[item.kind]}
        </span>
        {item.mine && (
          <span className="material-glass absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
            Yours
          </span>
        )}
      </div>
      <h3 className="mt-2 truncate text-[15px] font-semibold">{item.title}</h3>
      <p className="type-caption truncate text-ink-3">
        {[duration, warning ? "Content warning" : null]
          .filter(Boolean)
          .join(" · ") || " "}
      </p>
    </Link>
  );
}
