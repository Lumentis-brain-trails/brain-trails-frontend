"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  type Workspace,
  isUsable,
  seatOf,
  selectWorkspace,
  useCurrentWorkspace,
  useWorkspaces,
} from "@/lib/workspace";
import { cn, Icon } from "@/components/ui";

/** A workspace's mark on the rail: the first letter of its name, or P for personal. */
function initial(workspace: Workspace | undefined, personal: string): string {
  if (!workspace) return "";
  const name = workspace.kind === "personal" ? personal : workspace.name;
  return name.trim().charAt(0).toUpperCase();
}

/**
 * Which workspace the app works in (V4-0001, V4-0006): the personal one, or a clinic or
 * laboratory the person holds a seat in. Its requests still waiting for an admin are
 * listed too, unselectable, so a request does not seem to vanish; a link asks for a new
 * organisation.
 *
 * Choosing reloads on `/home`: every list of the app is scoped to the workspace, and a
 * full load is the one way none of them can show the old one's rows for a moment.
 * Only mounted while `workspaces_multi` is on.
 */
export function WorkspaceSwitcher() {
  const t = useTranslations("workspaces");
  const workspaces = useWorkspaces().data ?? [];
  const current = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const usable = workspaces.filter(isUsable);
  const waiting = workspaces.filter((w) => !isUsable(w));
  const nameOf = (w: Workspace) =>
    w.kind === "personal" ? t("kinds.personal") : w.name;

  return (
    <div ref={box} className="relative mb-3">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("switcher.label", {
          name: current ? nameOf(current) : "",
        })}
        onClick={() => setOpen((v) => !v)}
        className="pressable group/item relative flex h-10 w-10 items-center justify-center rounded-xl border border-hairline-strong bg-surface-2 text-[14px] font-semibold text-ink hover:bg-accent-soft"
      >
        {initial(current, t("kinds.personal"))}
        <span className="reveal absolute left-12 max-w-[168px] truncate text-left text-[14px] font-medium whitespace-nowrap text-ink-2">
          {current ? nameOf(current) : ""}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="enter-fade absolute top-0 left-12 z-50 w-72 rounded-2xl border border-hairline bg-surface p-2 shadow-(--shadow-card)"
        >
          <p className="type-caption px-3 pt-1 pb-2 text-ink-3">
            {t("switcher.title")}
          </p>
          {usable.map((w) => {
            const active = w.id === current?.id;
            const seat = seatOf(w);
            return (
              <button
                key={w.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  if (active) return;
                  selectWorkspace(w.id);
                  // A full load: every list is scoped to the workspace, none may show the old one.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.assign("/home");
                }}
                className={cn(
                  "pressable flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                  active ? "bg-accent-soft" : "hover:bg-surface-2"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2 text-[13px] font-semibold">
                  {initial(w, t("kinds.personal"))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {nameOf(w)}
                  </span>
                  <span className="block text-[12px] text-ink-3">
                    {w.kind === "personal"
                      ? t("editions.personal")
                      : t("switcher.kindAndSeat", {
                          kind: t(`kinds.${w.kind as "practice" | "lab"}`),
                          seat: seat ? t(`seats.${seat}`) : "",
                        })}
                  </span>
                </span>
                {active && (
                  <Icon name="check" className="h-4 w-4 text-accent" />
                )}
              </button>
            );
          })}
          {waiting.map((w) => (
            <div
              key={w.id}
              role="menuitem"
              aria-disabled
              className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-70"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-hairline-strong text-[13px]">
                {initial(w, t("kinds.personal"))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink-2">
                  {w.name}
                </span>
                <span className="block text-[12px] text-ink-3">
                  {w.status === "rejected"
                    ? t("switcher.rejected")
                    : t("switcher.pending")}
                </span>
              </span>
            </div>
          ))}
          <div className="my-1 h-px bg-hairline" aria-hidden />
          <Link
            href="/organisations/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="pressable flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("switcher.request")}
          </Link>
        </div>
      )}
    </div>
  );
}
