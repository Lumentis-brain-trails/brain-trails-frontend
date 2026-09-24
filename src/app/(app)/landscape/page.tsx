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
import { useEffect } from "react";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import {
  Card,
  EmptyState,
  ErrorBanner,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { type BrainLandscape, landscapeProblem } from "@/lib/brainLandscape";
import { markEpochSeen } from "@/lib/landscapeStatus";

/** How often to look again while the map is being built. */
const POLL_MS = 5000;

export default function BrainLandscapePage() {
  const t = useTranslations("landscape");
  const landscape = useQuery({
    queryKey: ["my-landscape"],
    queryFn: () => api.get<BrainLandscape>("landscape"),
    retry: false,
    // look again only while waiting can help: a map being built or rebuilt. A server
    // without landscapes, or a real error, would only be asked the same question again.
    refetchInterval: (query) =>
      query.state.data?.pending ||
      landscapeProblem(problemOf(query.state.error)) === "building"
        ? POLL_MS
        : false,
  });

  const problem = landscape.data
    ? null
    : landscapeProblem(problemOf(landscape.error));
  const data = landscape.data;
  // the map is on screen: the sidebar's "redrawn" mark has done its job
  const epoch = data?.epoch;
  useEffect(() => {
    if (epoch) markEpochSeen(epoch);
  }, [epoch]);

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

      {problem === "building" && (
        <EmptyState title={t("title")} text={t("notReady")} />
      )}
      {problem === "unavailable" && (
        <EmptyState title={t("title")} text={t("unavailable")} />
      )}
      {problem === "error" && <ErrorBanner message={t("failed")} />}
      {data?.change === "redrawn" && (
        <p className="mb-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-[14px] text-ink-2">
          {t("redrawn")}
        </p>
      )}

      {data && (
        <Card className="p-2 sm:p-4">
          <LandscapeSurface landscape={data} height={560} title={t("aria")} />
        </Card>
      )}

      <p className="type-caption mt-4 text-ink-3">{t("disclaimer")}</p>
    </main>
  );
}

/** The status and code of a failed request, whatever threw it. */
function problemOf(error: unknown) {
  return error instanceof ApiRequestError
    ? { status: error.status, error: { code: error.error.code } }
    : error
      ? { status: 0 }
      : null;
}
