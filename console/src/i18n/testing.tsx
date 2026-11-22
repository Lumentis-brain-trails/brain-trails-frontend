/**
 * Test wrappers: the console's catalogue (own messages plus the shared product
 * namespaces, as `request.ts` builds it) around a component under test.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import ownEn from "../../messages/en.json";
import ownIt from "../../messages/it.json";
import productEn from "../../../messages/en.json";
import productIt from "../../../messages/it.json";
import { catalogue } from "./catalogue";

export function IntlEn({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={catalogue(ownEn, productEn)}>
      {children}
    </NextIntlClientProvider>
  );
}

export function IntlIt({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="it" messages={catalogue(ownIt, productIt)}>
      {children}
    </NextIntlClientProvider>
  );
}
