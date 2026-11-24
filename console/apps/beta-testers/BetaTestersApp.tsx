"use client";

import { useTranslations } from "next-intl";
import { KeyValue } from "@/components/ui";
import { Sections } from "@console/components/Sections";
import { SnapshotPanel } from "@console/components/SnapshotPanel";
import { ElsewhereNotice, useOpsEnv } from "@console/components/env";
import type { AppPageProps } from "@console/lib/manifest";
import { useProductFeature } from "@console/lib/product";
import type { PendingPayload } from "./lib/pending";
import { ApplicationsSection } from "./sections/Applications";
import { OrganisationsSection } from "./sections/Organisations";
import { PeopleSection } from "./sections/People";

type Section = "applications" | "people" | "organisations";

/**
 * Beta testers on an environment other than the console's home (backend OPS-0005): the
 * board and its decisions are the home product's, so here only what bt-ops reads from
 * that environment - the applications waiting and the organisation requests - and where
 * to act instead.
 */
function Elsewhere({ semver }: AppPageProps) {
  const t = useTranslations("console.betaTesters");
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <ElsewhereNotice />
      <SnapshotPanel<PendingPayload>
        panelKey="beta-testers.pending"
        title={t("elsewhere.pending")}
      >
        {(p) => (
          <>
            <KeyValue label={t("elsewhere.waiting")} value={p.pending} mono />
            <KeyValue
              label={t("elsewhere.fromStand")}
              value={p.pending_wants_beta}
              mono
            />
            <KeyValue
              label={t("elsewhere.organisations")}
              value={p.organisations_pending}
              mono
            />
            {Object.entries(p.by_decision).map(([decision, n]) => (
              <KeyValue
                key={decision}
                label={t("elsewhere.decision", { decision })}
                value={n}
                mono
              />
            ))}
          </>
        )}
      </SnapshotPanel>
    </div>
  );
}

/** The app: the board on the home environment, a read-only count anywhere else. */
export function BetaTestersApp(props: AppPageProps) {
  const { isHome } = useOpsEnv();
  return isHome ? <Board {...props} /> : <Elsewhere {...props} />;
}

/**
 * Beta testers: who gets into the beta and who is in it - the applications board with
 * its cohorts, every account, and the organisation requests. Moved from the user app's
 * `/admin` (sprint O2); every decision is the product's own audited route, called with
 * your product account.
 */
function Board({ semver }: AppPageProps) {
  const t = useTranslations("console.betaTesters");
  const organisations = useProductFeature("workspaces_multi");
  const sections: {
    id: Section;
    label: string;
    render: () => React.ReactNode;
  }[] = [
    {
      id: "applications",
      label: t("applications"),
      render: () => <ApplicationsSection />,
    },
    { id: "people", label: t("people"), render: () => <PeopleSection /> },
  ];
  if (organisations) {
    sections.push({
      id: "organisations",
      label: t("organisations"),
      render: () => <OrganisationsSection />,
    });
  }
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      <Sections label={t("sections")} sections={sections} />
    </div>
  );
}
