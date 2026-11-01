"use client";

import { useTranslations } from "next-intl";
import { Button, Card, ErrorBanner, Skeleton } from "@/components/ui";
import { Age } from "@console/components/Age";
import { useErrorText } from "@console/components/useErrorText";
import { useRefresh, useSnapshot } from "@console/components/data";

/**
 * A panel drawn from its newest snapshot, with its age and the button that retakes it.
 * Nothing here refreshes on its own (backend decision 0014): opening the panel reads the
 * stored snapshot, a click runs the panel again.
 *
 * `children` gets the payload and the snapshot's age in seconds, so a panel that shows
 * "4 min ago" from a value measured at refresh time can add the time since.
 */
export function SnapshotPanel<T>({
  panelKey,
  title,
  className,
  children,
}: {
  panelKey: string;
  title: string;
  className?: string;
  children: (payload: T, ageSeconds: number) => React.ReactNode;
}) {
  const t = useTranslations("console.panel");
  const errorText = useErrorText();
  const snapshot = useSnapshot(panelKey);
  const refresh = useRefresh();
  return (
    <Card inset className={className}>
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
      {(refresh.isError || snapshot.isError) && (
        <div className="p-4">
          <ErrorBanner message={errorText(refresh.error ?? snapshot.error)} />
        </div>
      )}
      {snapshot.isPending ? (
        <Skeleton className="m-5 h-20" />
      ) : snapshot.data ? (
        children(snapshot.data.payload as T, snapshot.data.age_seconds)
      ) : (
        <p className="px-5 py-6 text-[14px] text-ink-3">{t("never")}</p>
      )}
    </Card>
  );
}
