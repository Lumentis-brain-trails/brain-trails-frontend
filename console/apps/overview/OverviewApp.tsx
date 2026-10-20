"use client";

import { useTranslations } from "next-intl";
import { Button, Card, ErrorBanner, KeyValue, Skeleton } from "@/components/ui";
import { Age } from "@console/components/Age";
import { Sparkline } from "@console/components/Charts";
import { useErrorText } from "@console/components/useErrorText";
import { useRefresh, useSnapshot } from "@console/components/data";
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

/** A panel drawn from its snapshot, with its age and the button that retakes it. */
function Panel<T>({
  panelKey,
  title,
  children,
}: {
  panelKey: string;
  title: string;
  children: (payload: T) => React.ReactNode;
}) {
  const t = useTranslations("console.overview");
  const errorText = useErrorText();
  const snapshot = useSnapshot(panelKey);
  const refresh = useRefresh();
  return (
    <Card inset>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <h2 className="type-heading">{title}</h2>
        <div className="flex items-center gap-3">
          {snapshot.data && <Age seconds={snapshot.data.age_seconds} />}
          <Button
            size="sm"
            variant="secondary"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(panelKey)}
          >
            {t("refresh")}
          </Button>
        </div>
      </div>
      {refresh.isError && (
        <div className="p-4">
          <ErrorBanner message={errorText(refresh.error)} />
        </div>
      )}
      {snapshot.isPending ? (
        <Skeleton className="m-5 h-20" />
      ) : snapshot.data ? (
        children(snapshot.data.payload as T)
      ) : (
        <p className="px-5 py-6 text-[14px] text-ink-3">{t("never")}</p>
      )}
    </Card>
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
