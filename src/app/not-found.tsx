import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("shell.notFound");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="type-eyebrow text-ink-3">404</p>
      <h1 className="type-title mt-3">{t("title")}</h1>
      <Link href="/home" className={buttonClass("ghost", "md", "mt-8")}>
        {t("home")}
      </Link>
    </main>
  );
}
