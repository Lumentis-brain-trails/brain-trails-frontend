"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Spinner, cn } from "@/components/ui";
import { appFor } from "@console/apps";
import { Age } from "@console/components/Age";
import { useErrorText } from "@console/components/useErrorText";
import {
  useRefresh,
  useSetLayout,
  useStrip,
  useWidgets,
} from "@console/components/data";
import type { StripItem } from "@console/lib/client";

const WIDTH = { s: "w-44", m: "w-60", l: "w-80" } as const;

/** A circular arrow on the product's 16px icon grid (its set has none). */
function RefreshGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One widget: its title, its snapshot drawn by its app, its age and a refresh button. */
function WidgetCard({ item }: { item: StripItem }) {
  const t = useTranslations("console.strip");
  const errorText = useErrorText();
  const refresh = useRefresh();
  const render = appFor(item.app)?.widgets[item.widget];
  return (
    <section
      aria-label={item.title}
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface p-4",
        WIDTH[item.size]
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink-2">{item.title}</h3>
        <button
          type="button"
          onClick={() => refresh.mutate(item.key)}
          disabled={refresh.isPending}
          className="pressable text-ink-3 hover:text-ink"
          aria-label={t("refresh", { title: item.title })}
        >
          {refresh.isPending ? <Spinner /> : <RefreshGlyph />}
        </button>
      </header>
      <div className="min-h-12 flex-1">
        {item.snapshot && render ? (
          render(item.snapshot.payload)
        ) : (
          <p className="text-[13px] text-ink-3">{t("never")}</p>
        )}
      </div>
      <footer className="flex items-center justify-between gap-2">
        {item.snapshot ? <Age seconds={item.snapshot.age_seconds} /> : <span />}
        {refresh.isError && (
          <span className="text-[12px] text-danger">
            {errorText(refresh.error)}
          </span>
        )}
      </footer>
    </section>
  );
}

/** Choosing what sits on the strip: every widget the person may use, on or off. */
function StripEditor({
  items,
  onClose,
}: {
  items: StripItem[];
  onClose: () => void;
}) {
  const t = useTranslations("console.strip");
  const widgets = useWidgets(true);
  const save = useSetLayout();
  const [chosen, setChosen] = useState(() =>
    items.map((i) => `${i.app}.${i.widget}`)
  );
  const toggle = (id: string) =>
    setChosen((now) =>
      now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
    );
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4">
      <p className="mb-3 text-[13px] text-ink-2">{t("editIntro")}</p>
      <ul className="mb-4 grid gap-2 sm:grid-cols-2">
        {(widgets.data ?? []).map((w) => {
          const id = `${w.app}.${w.widget}`;
          return (
            <li key={id}>
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  onChange={() => toggle(id)}
                />
                <span>{w.title}</span>
                <span className="text-ink-3">· {w.app_name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              chosen.map((id) => {
                const [app, widget] = id.split(".");
                return { app, widget, size: "m" as const };
              }),
              { onSuccess: onClose }
            )
          }
        >
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The strip above the launcher and the apps: the person's widgets, each one the last
 * snapshot of a panel with its age. Loading it reads `braintrails_ops` only; a refresh
 * is a click on one widget.
 */
export function WidgetStrip() {
  const t = useTranslations("console.strip");
  const strip = useStrip();
  const [editing, setEditing] = useState(false);
  const items = strip.data ?? [];
  return (
    <div className="border-b border-hairline bg-surface-2/60 px-4 py-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="type-eyebrow text-ink-3">{t("title")}</h2>
        <button
          type="button"
          className="text-[13px] text-ink-2 hover:text-ink"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? t("done") : t("edit")}
        </button>
      </div>
      {editing ? (
        <StripEditor items={items} onClose={() => setEditing(false)} />
      ) : items.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-3">
          {strip.isPending ? "" : t("empty")}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <WidgetCard key={`${item.app}.${item.widget}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
