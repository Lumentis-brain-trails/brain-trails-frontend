import { useTranslations } from "next-intl";

/**
 * The frame of the three sign-in screens: the product's dark auth ground, the console's
 * name and one card.
 */
export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("console.auth");
  return (
    <main
      data-theme="dark"
      className="flex min-h-screen flex-1 items-center justify-center bg-canvas px-4 py-16 text-ink"
    >
      <div className="w-full max-w-sm">
        <p className="type-eyebrow text-ink-3">{t("eyebrow")}</p>
        <h1 className="type-title mt-2">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
