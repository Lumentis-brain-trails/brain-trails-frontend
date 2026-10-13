"use client";

/**
 * The language setting, from the account page.
 *
 * The choice lives in this browser (a cookie), not on the account: it takes effect
 * before anyone has signed in, and the entry screens carry the same switch.
 */
import { useTranslations } from "next-intl";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Card, ListRow, SectionTitle } from "@/components/ui";

export function LanguageCard() {
  const t = useTranslations("language");
  return (
    <>
      <SectionTitle>{t("title")}</SectionTitle>
      <Card inset>
        <ListRow className="justify-between">
          <span>
            <span className="block">{t("label")}</span>
            <span className="type-caption text-ink-3">{t("hint")}</span>
          </span>
          <LanguageSwitch />
        </ListRow>
      </Card>
    </>
  );
}
