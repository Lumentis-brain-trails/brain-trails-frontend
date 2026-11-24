"use client";

import { useTranslations } from "next-intl";
import { KeyValue } from "@/components/ui";
import { Sections } from "@console/components/Sections";
import { SnapshotPanel } from "@console/components/SnapshotPanel";
import { ElsewhereNotice, useOpsEnv } from "@console/components/env";
import type { AppPageProps } from "@console/lib/manifest";
import { CatalogLocksSection } from "./sections/CatalogLocks";
import { FairSection } from "./sections/Fair";
import { ReviewSection } from "./sections/Review";

/** The backend's `moderation.queue` panel, as stored in its snapshot. */
interface QueuePayload {
  review: number;
  media: number;
  protocols: number;
  stand_waiting: number;
}

/**
 * Moderation on an environment other than the console's home (backend OPS-0005): every
 * act is the home product's, so here only the queue bt-ops reads from that environment,
 * and where to act instead.
 */
function Elsewhere({ semver }: AppPageProps) {
  const t = useTranslations("console.moderation.elsewhere");
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <ElsewhereNotice />
      <SnapshotPanel<QueuePayload>
        panelKey="moderation.queue"
        title={t("queue")}
      >
        {(p) => (
          <>
            <KeyValue label={t("review")} value={p.review} mono />
            <KeyValue label={t("media")} value={p.media} mono />
            <KeyValue label={t("protocols")} value={p.protocols} mono />
            <KeyValue label={t("stand")} value={p.stand_waiting} mono />
          </>
        )}
      </SnapshotPanel>
    </div>
  );
}

/** The app: its sections on the home environment, the queue's counts anywhere else. */
export function ModerationApp(props: AppPageProps) {
  const { isHome } = useOpsEnv();
  return isHome ? <Board {...props} /> : <Elsewhere {...props} />;
}

/**
 * Moderation: what is published and who is called to the stand - media and protocol
 * review, catalog locks, fair mode and its queue. Moved from the user app's `/admin`
 * (sprint O2); every act is the product's own audited route, called with your product
 * account.
 */
function Board({ semver }: AppPageProps) {
  const t = useTranslations("console.moderation");
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      <Sections
        label={t("sections")}
        sections={[
          { id: "review", label: t("review"), render: () => <ReviewSection /> },
          {
            id: "locks",
            label: t("locks"),
            render: () => <CatalogLocksSection />,
          },
          { id: "fair", label: t("fair"), render: () => <FairSection /> },
        ]}
      />
    </div>
  );
}
