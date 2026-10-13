"use client";

/**
 * The language setting, from the account page.
 *
 * The choice is kept in this browser (a cookie, so the page renders in it at once) and
 * on the account, so it follows the person and the backend writes to them in it. The
 * entry screens carry the same switch for someone who has not signed in yet.
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
          <LanguageSwitch account />
        </ListRow>
      </Card>
    </>
  );
}
