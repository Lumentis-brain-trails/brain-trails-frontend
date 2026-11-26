"use client";

/**
 * The note that calls a student into their class's game, on every page of the app while
 * the teacher has one open (flag `class_games`). Only an account enrolled in a school
 * asks (`useMyGame`). It never shows where the game already is (the student's `/play`,
 * the teacher's `/school/...` pages), and once closed it stays closed for this browser
 * session (Andrea, 2026-11-25: it kept coming back while a lesson moved on).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Icon, buttonClass } from "@/components/ui";
import { useMyGame } from "@/lib/classgame/useClassGame";

export const PLAY_PATH = "/play";
const CLOSED_KEY = "bt-class-game-call-closed";

/** Whether the note has no place on `pathname`: the game is already on screen there. */
export function hiddenOn(pathname: string): boolean {
  return pathname === PLAY_PATH || pathname.startsWith("/school");
}

function closedBefore(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ClassGameCall() {
  const t = useTranslations("classGame.call");
  const pathname = usePathname();
  const [closed, setClosed] = useState(closedBefore);
  const hidden = hiddenOn(pathname) || closed;
  const game = useMyGame(!hidden);
  if (hidden || !game.data?.open) return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(CLOSED_KEY, "1");
    } catch {
      // a private window: closed for this page's life only
    }
  };
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
      <div className="flex shrink-0 items-center gap-1">
        <Link href={PLAY_PATH} className={buttonClass("primary", "sm")}>
          {t("join")}
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="pressable rounded-full p-2 text-ink-3 hover:bg-surface-2"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
