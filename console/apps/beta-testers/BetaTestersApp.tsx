"use client";

import { useTranslations } from "next-intl";
import { Sections } from "@console/components/Sections";
import type { AppPageProps } from "@console/lib/manifest";
import { useProductFeature } from "@console/lib/product";
import { ApplicationsSection } from "./sections/Applications";
import { OrganisationsSection } from "./sections/Organisations";
import { PeopleSection } from "./sections/People";

type Section = "applications" | "people" | "organisations";

/**
 * Beta testers: who gets into the beta and who is in it - the applications board with
 * its cohorts, every account, and the organisation requests. Moved from the user app's
 * `/admin` (sprint O2); every decision is the product's own audited route, called with
 * your product account.
 */
export function BetaTestersApp({ semver }: AppPageProps) {
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
