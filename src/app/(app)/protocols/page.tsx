"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ApiRequestError, api } from "@/lib/api";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import { type ProtocolCard as Card } from "@/lib/protocol/catalog";
import { CATALOG_QUERY, useOfficialTexts } from "@/lib/protocol/official";
import { MEDIA_TAGS, type MediaTag } from "@/lib/types";
import { ProtocolCard } from "@/components/ProtocolCard";
import {
  EmptyState,
  ErrorBanner,
  Icon,
  Skeleton,
  buttonClass,
} from "@/components/ui";

type Row = { key: string; title: string; hint: string; items: Card[] };

/**
 * Open an empty builder (S19).
 *
 * Nothing is created here: the builder saves the protocol the first time there is
 * something on its timeline, so a button pressed by mistake leaves no empty draft in
 * the catalog.
 */
function NewProtocolButton() {
  const t = useTranslations("protocols.catalog");
  return (
    <Link href="/protocols/new/edit" className={buttonClass()}>
      <Icon name="plus" /> {t("new")}
    </Link>
  );
}

/**
 * The protocol catalog (V3-0004, S16-S18): rows of cards scrolling sideways like a
 * streaming service - Official, Community, yours, then one row per browsing tag. A card
 * opens the protocol's page, where Play starts it. Protocols are rows of their own:
 * a video becomes one through "Create a protocol from this" in My media.
 *
 * Two requests: the published catalog (locked cards included on purpose - a row of one
 * card reads as a bug, and a locked card says what is coming without pretending it is
 * ready) and the caller's own protocols, drafts included.
 */
export default function ProtocolsPage() {
  const t = useTranslations("protocols.catalog");
  const tTags = useTranslations("protocols.tags");
  const workspace = useCurrentWorkspace();
  // a bad request or an expired session will not become valid on retry: fail fast
  const retry = (count: number, error: Error) =>
    error instanceof ApiRequestError && error.status < 500 ? false : count < 2;
  const official = useOfficialTexts();
  const catalog = useQuery({ ...CATALOG_QUERY, retry });
  const mine = useQuery({
    queryKey: ["protocols", "mine", workspace?.id],
    queryFn: () =>
      api.get<Card[]>(inWorkspace("protocols?mine=true&limit=100", workspace)),
    enabled: workspace !== undefined,
    retry,
  });
  const items = catalog.data;

  // An older API may not send `tags` or `access` at all; a missing one is not locked.
  const tagsOf = (p: Card) => p.tags ?? [];
  const locked = (p: Card) => p.access === "locked";

  /**
   * Runnable first inside a row, so the one thing a reader can actually start leads;
   * then by the title the card shows, which for an official protocol is the reader's.
   */
  const openFirst = (a: Card, b: Card) =>
    locked(a) === locked(b)
      ? official.card(a).title.localeCompare(official.card(b).title)
      : locked(a)
        ? 1
        : -1;

  const rows: Row[] = items
    ? [
        {
          key: "official",
          title: t("rows.official.title"),
          hint: t("rows.official.hint"),
          items: items
            .filter((i) => i.visibility === "official" && !locked(i))
            .sort(openFirst),
        },
        {
          key: "mine",
          title: t("rows.mine.title"),
          hint: t("rows.mine.hint"),
          items: (mine.data ?? []).filter((i) => i.visibility === "workspace"),
        },
        {
          key: "community",
          title: t("rows.community.title"),
          hint: t("rows.community.hint"),
          items: items.filter((i) => i.visibility === "public"),
        },
        ...MEDIA_TAGS.map((tag: MediaTag) => ({
          key: tag,
          title: tTags(`${tag}.title`),
          hint: tTags(`${tag}.hint`),
          items: items.filter((i) => tagsOf(i).includes(tag)).sort(openFirst),
        })),
      ].filter((row) => row.items.length > 0)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">{t("title")}</h1>
          <p className="mt-1 text-ink-2">{t("intro")}</p>
        </div>
        <NewProtocolButton />
      </header>

      {catalog.isPending && (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-[228px] shrink-0">
              <Skeleton className="aspect-video w-full rounded-[var(--radius-card)]" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {catalog.isError && <ErrorBanner message={t("loadError")} />}

      {items && rows.length === 0 && (
        <EmptyState
          title={t("empty.title")}
          text={t("empty.text")}
          action={
            <Link href="/media" className={buttonClass()}>
              {t("empty.action")}
            </Link>
          }
        />
      )}

      <div className="flex flex-col gap-10">
        {rows.map((row) => (
          <section key={row.key} aria-label={row.title}>
            <h2 className="type-heading">{row.title}</h2>
            <p className="type-caption mt-0.5 text-ink-3">{row.hint}</p>
            <div className="-mx-6 mt-4 flex gap-4 overflow-x-auto px-6 pb-2">
              {row.items.map((item) => (
                <ProtocolCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {rows.some((row) => row.items.some(locked)) && (
        <p className="type-caption mt-10 text-ink-3">{t("lockedNote")}</p>
      )}
    </main>
  );
}
