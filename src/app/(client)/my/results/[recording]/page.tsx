"use client";

/**
 * A patient's own results, when their carer shares them in full (backend T6,
 * `share_results = full`): the trail of one of their sessions. The API answers only
 * while that level holds (`subject#reader`); otherwise the page says it is not shared.
 * The carers' notes are never part of it.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use } from "react";
import { TrailPlot } from "@/components/TrailPlot";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Analysis } from "@/lib/types";

export default function MyResultsPage({
  params,
}: {
  params: Promise<{ recording: string }>;
}) {
  const { recording } = use(params);
  const t = useTranslations("therapy.results");
  const analysis = useQuery({
    queryKey: ["me", "results", recording],
    queryFn: () => api.get<Analysis>(`recordings/${recording}/analysis`),
    retry: false,
  });
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/my" className="text-[14px] text-ink-2 hover:text-ink">
        {t("back")}
      </Link>
      <h1 className="type-title mt-4 mb-6">{t("title")}</h1>
      {analysis.isLoading && <Spinner />}
      {analysis.isError && (
        <EmptyState title={t("title")} text={t("notShared")} />
      )}
      {analysis.data && (
        <Card className="p-2 sm:p-4">
          <TrailPlot analysis={analysis.data} height={400} />
        </Card>
      )}
    </main>
  );
}
