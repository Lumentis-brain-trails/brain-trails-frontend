/**
 * Media for a builder preview, which has no session to ask.
 *
 * A real run gets its media map from the session start: fresh links for every library
 * item the version names, bound onto the plan by `bindMedia` just before it runs. The
 * builder's Preview had no session and skipped that step, so a video block reached the
 * runner with a `media_id` and no `src` - and the run fell over the moment it got there.
 *
 * Here the same map is built from `GET /media/{id}`, the detail that already signs a
 * short-lived link to the file (the builder's monitor plays from it too). A text item
 * carries its passage as `definition.body`, exactly as the session map does, so a
 * preview binds the same way a run does and shows the same thing.
 */
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BoundMedia } from "./media";

interface MediaDetail {
  id: string;
  kind: string;
  url?: string | null;
  cover_url?: string | null;
  duration_s?: number | null;
  definition?: Record<string, unknown> | null;
}

/** One library item as the session's media map would have given it. */
export function toBoundMedia(item: MediaDetail): BoundMedia {
  const body = item.kind === "text" ? item.definition?.body : undefined;
  return {
    url: item.url ?? "",
    kind: item.kind,
    poster_url: item.cover_url ?? null,
    duration_s: item.duration_s ?? null,
    body: typeof body === "string" && body ? body : null,
  };
}

export interface PreviewMedia {
  /** The map, once every item has answered; null while any is still loading. */
  media: Record<string, BoundMedia> | null;
  /** The first item that could not be fetched - deleted, or not yours to play. */
  missing: string | null;
}

/** Fetch every item a plan names, in parallel, and hand back a session-shaped map. */
export function usePreviewMedia(ids: string[]): PreviewMedia {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["media", id, "file"],
      queryFn: () => api.get<MediaDetail>(`media/${id}`),
      // Presigned links are short-lived; a preview opened later must not reuse old ones.
      staleTime: 60_000,
      retry: 1,
    })),
  });
  const failed = results.findIndex((r) => r.isError);
  if (failed >= 0) return { media: null, missing: ids[failed] ?? null };
  if (results.some((r) => !r.data)) return { media: null, missing: null };
  const media: Record<string, BoundMedia> = {};
  results.forEach((r, i) => {
    if (r.data) media[ids[i]] = toBoundMedia(r.data);
  });
  return { media, missing: null };
}
