"use client";

/**
 * Brain Landscape: every recording the person has made, on one map (backend V3-0013).
 *
 * Height is where their brain spent the most time across all their sessions; hovering the
 * ground says what they were doing there - which block, which kind of trial - from every
 * recording that went there. The map is rebuilt after each new recording, which is the
 * point of the page: coming back after a session and seeing the landscape change.
 *
 * Only ever the person's own recordings. The first visit of an account that recorded
 * before landscapes existed is also what asks for its first build.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import { Card, EmptyState, Skeleton, Spinner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { BrainLandscape } from "@/lib/brainLandscape";

/** How often to look again while the map is being built. */
const POLL_MS = 5000;

export default function BrainLandscapePage() {
  const t = useTranslations("landscape");
  const landscape = useQuery({
    queryKey: ["my-landscape"],
    queryFn: () => api.get<BrainLandscape>("landscape"),
    retry: false,
    refetchInterval: (query) =>
      query.state.status === "error" || query.state.data?.pending
        ? POLL_MS
        : false,
  });

  // 409 is "not built yet": asking queued the first build when there is anything to
  // build from, so the page keeps looking. Anything else is a real error.
  const notReady =
    landscape.error instanceof ApiRequestError &&
    landscape.error.error.code === "not_ready";
  const data = landscape.data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="type-title">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-ink-2">{t("intro")}</p>
        {data && (
          <p className="type-caption mt-2 flex items-center gap-2 text-ink-3">
            {t("meta", {
              n: data.n_recordings,
              windows: data.n_windows,
              date: new Date(data.built_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
            {data.pending && (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="h-3 w-3 text-accent" />
                {t("updating")}
              </span>
            )}
          </p>
        )}
      </header>

      {landscape.isLoading && <Skeleton className="h-[560px]" />}

      {notReady && <EmptyState title={t("title")} text={t("notReady")} />}

      {data && (
        <Card className="p-2 sm:p-4">
          <LandscapeSurface landscape={data} height={560} title={t("aria")} />
        </Card>
      )}

      <p className="type-caption mt-4 text-ink-3">{t("disclaimer")}</p>
    </main>
  );
}
