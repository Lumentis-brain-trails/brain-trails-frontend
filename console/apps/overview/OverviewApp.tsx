"use client";

import { useTranslations } from "next-intl";
import { KeyValue } from "@/components/ui";
import { Sparkline } from "@console/components/Charts";
import { SnapshotPanel as Panel } from "@console/components/SnapshotPanel";
import type { AppPageProps } from "@console/lib/manifest";

interface PeoplePayload {
  total: number;
  new_14d: number;
  by_status: Record<string, number>;
}

interface RecordingsPayload {
  count: number;
  total_minutes: number;
  by_source: Record<string, number>;
  per_day: { day: string; count: number }[];
  jobs_by_status: Record<string, number>;
}

/** The strip's widget: recordings per day over 14 days. */
export function RecordingsWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.overview");
  const data = payload as unknown as RecordingsPayload;
  return (
    <div>
      <p className="type-figure">
        {data.per_day.reduce((n, d) => n + d.count, 0)}
      </p>
      <Sparkline
        values={data.per_day.map((d) => d.count)}
        label={t("recordingsChart")}
      />
    </div>
  );
}

/**
 * Overview: the numbers of the product's admin dashboard, read from the product database
 * through the console's read-only door, on a person's refresh. Statistics (O3) replaces
 * it with real definitions.
 */
export function OverviewApp({ semver }: AppPageProps) {
  const t = useTranslations("console.overview");
  return (
    <div data-version={semver} className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <p className="text-ink-2 lg:col-span-2">{t("intro")}</p>
      <Panel<PeoplePayload> panelKey="overview.people" title={t("people")}>
        {(p) => (
          <>
            <KeyValue label={t("total")} value={p.total} mono />
            <KeyValue label={t("new14d")} value={p.new_14d} mono />
            {Object.entries(p.by_status).map(([status, n]) => (
              <KeyValue key={status} label={status} value={n} mono />
            ))}
          </>
        )}
      </Panel>
      <Panel<RecordingsPayload>
        panelKey="overview.recordings"
        title={t("recordings")}
      >
        {(r) => (
          <>
            <div className="px-5 py-3">
              <Sparkline
                values={r.per_day.map((d) => d.count)}
                label={t("recordingsChart")}
              />
            </div>
            <KeyValue label={t("count")} value={r.count} mono />
            <KeyValue label={t("minutes")} value={r.total_minutes} mono />
            {Object.entries(r.jobs_by_status).map(([status, n]) => (
              <KeyValue
                key={status}
                label={t("jobs", { status })}
                value={n}
                mono
              />
            ))}
          </>
        )}
      </Panel>
    </div>
  );
}
