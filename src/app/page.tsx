import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CornerRibbons } from "@/components/CornerRibbons";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/components/ui";

/**
 * Entry screen: one viewport, no scroll. The name, one line about the product,
 * and the two ways in.
 *
 * This is the brand surface and the only page that departs from the monochrome
 * system (docs/DESIGN.md): it commits to a dark ground in both colour schemes so
 * the ribbons read as light, which is what they are.
 */
export default async function Home() {
  const t = await getTranslations("public");
  return (
    <main className="relative isolate grid h-[100svh] min-h-[480px] grid-rows-[1fr_auto] overflow-hidden bg-[#04060b] px-4 pt-6 pb-5 text-[#f1f4fa]">
      <CornerRibbons className="absolute inset-0 -z-10 h-full w-full" />

      <div className="grid content-center justify-items-center gap-8 text-center">
        <Logo size={132} className="-my-4" />
        <h1 className="font-display text-[clamp(2.8rem,10vw,5rem)] leading-none font-bold tracking-[-0.035em] text-balance">
          {BRAND}
        </h1>
        <p className="font-display max-w-[34ch] text-[clamp(0.98rem,2.4vw,1.15rem)] leading-relaxed font-light text-[#9ea8bd]">
          {t("landing.tagline")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="pressable font-display inline-flex h-12 items-center rounded-full bg-[#f1f4fa] px-7 text-[15px] font-semibold text-[#05080e] hover:bg-white"
          >
            {t("landing.signIn")}
          </Link>
          <Link
            href="/register"
            className="pressable font-display inline-flex h-12 items-center rounded-full border border-[#2a3346] bg-[rgba(6,9,15,0.5)] px-7 text-[15px] font-semibold text-[#f1f4fa] hover:border-[#8fe6ec]"
          >
            {t("landing.createAccount")}
          </Link>
        </div>
      </div>

      <div className="font-display flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] tracking-[0.15em] text-[#56607a] uppercase">
        <span>{t("footer.nonClinical")}</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:text-[#9ea8bd]">
          {t("footer.privacy")}
        </Link>
      </div>
    </main>
  );
}
