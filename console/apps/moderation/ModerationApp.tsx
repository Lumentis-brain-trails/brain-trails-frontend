"use client";

import { useTranslations } from "next-intl";
import { Sections } from "@console/components/Sections";
import type { AppPageProps } from "@console/lib/manifest";
import { CatalogLocksSection } from "./sections/CatalogLocks";
import { FairSection } from "./sections/Fair";
import { ReviewSection } from "./sections/Review";

/**
 * Moderation: what is published and who is called to the stand - media and protocol
 * review, catalog locks, fair mode and its queue. Moved from the user app's `/admin`
 * (sprint O2); every act is the product's own audited route, called with your product
 * account.
 */
export function ModerationApp({ semver }: AppPageProps) {
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
