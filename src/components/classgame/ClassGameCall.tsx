"use client";

/**
 * The note that calls a student into their class's game, on every page of the app while
 * the teacher has one open (flag `class_games`). Only an account enrolled in a school
 * asks (`useMyGame`); the game page itself does not show it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/ui";
import { useMyGame } from "@/lib/classgame/useClassGame";

export const PLAY_PATH = "/play";

export function ClassGameCall() {
  const t = useTranslations("classGame.call");
  const pathname = usePathname();
  const game = useMyGame(pathname !== PLAY_PATH);
  if (pathname === PLAY_PATH || !game.data?.open) return null;
  return (
    <div
      role="status"
      className="material-glass enter-up fixed right-4 bottom-4 left-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-hairline p-4 shadow-(--shadow-card) sm:left-auto sm:w-96 md:left-auto"
    >
      <div className="min-w-0">
        <p className="font-medium">{t("title")}</p>
        {game.data.school_name && (
          <p className="truncate text-sm text-ink-2">{game.data.school_name}</p>
        )}
      </div>
      <Link href={PLAY_PATH} className={buttonClass("primary", "sm")}>
        {t("join")}
      </Link>
    </div>
  );
}
