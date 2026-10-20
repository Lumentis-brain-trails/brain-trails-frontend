"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Spinner } from "@/components/ui";
import { SideRail } from "@console/components/SideRail";
import { WidgetStrip } from "@console/components/WidgetStrip";
import { useAuthRedirect, useMe } from "@console/components/data";
import { session } from "@console/lib/client";

/**
 * The console's shell (backend OPS-0003): the widget strip on top, the side rail on the
 * left, the launcher or an open app in the centre. `GET /me` gates it: a session still
 * owing its second factor goes back to the code, a signed-out one to the sign-in.
 */
export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("console.shell");
  const router = useRouter();
  const me = useMe();
  useAuthRedirect(me.error);

  if (!me.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3 sm:px-6">
        <p className="font-display text-[15px] font-semibold">{t("name")}</p>
        <div className="flex items-center gap-3 text-[13px] text-ink-2">
          <span className="max-sm:hidden">{me.data.email}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await session.close();
              router.replace("/login");
            }}
          >
            {t("signOut")}
          </Button>
        </div>
      </header>
      <WidgetStrip />
      <div className="flex flex-1">
        <SideRail />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
