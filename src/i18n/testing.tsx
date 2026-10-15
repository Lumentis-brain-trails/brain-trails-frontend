/**
 * Test wrapper: the English catalogue around a component under test.
 *
 * A component that calls `useTranslations` throws outside a provider, so every test
 * that renders one wraps it here. English is the reference locale and what the
 * assertions read; `messages.test.ts` is what checks the other locales.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../../messages/en.json";

export function IntlEn({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
