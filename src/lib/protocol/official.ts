/**
 * The official protocols in the reader's language.
 *
 * A protocol's words - its title, its warning, its block labels, the instructions a
 * participant reads - are stored data, and for a protocol somebody wrote by hand they
 * are shown as stored: the author's words are the author's. The official protocols are
 * ours, so their words belong to the catalogue like the rest of the app's copy
 * (`messages/*.json`, namespace `official`), keyed by the protocol's slug and, inside it,
 * by block id:
 *
 *     official.<slug>.title | summary | description | contentWarning | consentText
 *     official.<slug>.blocks.<blockId>.label
 *     official.<slug>.blocks.<blockId>.config.<path>      (lines.0.text, advance.label, …)
 *     official.<slug>.groups.<nodeId>.label               (a loop or a named sequence)
 *
 * The stored data stays canonical English: the tree, the plan posted to the backend and
 * every field stamped on an event are never touched. Only a **display site** asks this
 * module, and gets the stored string back whenever the catalogue has no key for it - a
 * block added by a newer backend, an older version of a protocol, a slug nobody keyed.
 * A person's copy of an official protocol is theirs (`visibility` is no longer
 * `official`) and is shown as stored.
 *
 * In English nothing is looked up at all (`useOfficialTexts`, `useRecordingTitle`): the
 * stored words are the very text the English keys were copied from, so showing them as
 * stored costs nothing and means an edit an admin makes to an official protocol shows
 * at once. The English keys exist as the reference the other languages are held to. In
 * another language a keyed string wins over the stored one, so such an edit needs its
 * key updated to be seen there.
 *
 * Where the English values come from: the trees in `schemas/templates/<slug>.json`
 * (`official.test.tsx` holds every key to its template's string), and - for `title`,
 * `summary`, `description` and the locked `coming-*` placeholders, which the frontend
 * cannot see - the backend's `app/protocols/templates.py` (`TEMPLATES`, `PLACEHOLDERS`),
 * copied by hand.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { api } from "@/lib/api";
import type { OutlineItem, ProtocolCard, ProtocolDetail } from "./catalog";

/** The `official` namespace's translator, as `useTranslations` returns it. */
export type OfficialT = ReturnType<typeof useTranslations<"official">>;

/** What every helper here needs to know of a protocol. */
interface Identity {
  slug: string;
  visibility: string;
}

/** The texts a catalog card or a detail page shows. */
interface CardTexts extends Identity {
  title: string;
  summary?: string | null;
  description?: string | null;
  content_warning?: string | null;
}

/** A detail page's texts: the card's, and the outline read against the tree. */
type DetailTexts = CardTexts & Pick<ProtocolDetail, "outline" | "definition">;

/** The manifest texts the consent gate shows. */
interface ManifestTexts {
  content_warning: string | null;
  consent_text: string | null;
}

/** A step of a resolved plan, as far as its words go. */
interface StepTexts {
  id: string;
  label?: string;
  config?: unknown;
  block?: { block_id?: string };
}

/**
 * Config paths (array indexes as `*`) whose strings a participant reads.
 *
 * A closed list rather than "every string": a config also carries wire values (`mode`,
 * `eyes`, `instrument`), marker names (`markers.*`, `lines.*.marker`, a video's
 * `cues.*.label`) and media ids. Answer options (`items.*.choices.*`,
 * `scenes.*.choices.*`) are left out on purpose: the questionnaire and the quiz stamp
 * the chosen option onto the event as `choice_label`, so translating them where they
 * are rendered would put the reader's language into the recorded data.
 */
const DISPLAY_PATHS: ReadonlySet<string> = new Set([
  "lines.*.text",
  "advance.label",
  "footnote",
  "prompt",
  "message",
  "body",
  "items.*.text",
  "items.*.anchors.*",
  "scenes.*.prompt",
]);

function isDisplayPath(path: readonly string[]): boolean {
  return DISPLAY_PATHS.has(
    path.map((part) => (/^\d+$/.test(part) ? "*" : part)).join(".")
  );
}

/** The catalogue's string for `key`, or `stored` when it has none. */
function lookup(t: OfficialT, key: string, stored: string): string {
  return t.has(key as never) ? t(key as never) : stored;
}

/** `lookup` for a text that may be absent: an absent text stays absent. */
function lookupOptional<T extends string | null | undefined>(
  t: OfficialT,
  key: string,
  stored: T
): T | string {
  return typeof stored === "string" && stored ? lookup(t, key, stored) : stored;
}

/** Whether the catalogue owns this protocol's words. */
export function isOfficial(
  protocol: { visibility?: string | null } | null | undefined
): boolean {
  return protocol?.visibility === "official";
}

/** The slug to look an official protocol up by; null for anyone else's. */
export function officialSlug(
  protocol: Partial<Identity> | null | undefined
): string | null {
  return isOfficial(protocol) && protocol?.slug ? protocol.slug : null;
}

/** An official protocol's title, or the stored one. */
export function officialTitle(
  t: OfficialT,
  slug: string,
  stored: string
): string {
  return lookup(t, `${slug}.title`, stored);
}

/**
 * A card (or a detail) with its title, summary, description and content warning in the
 * reader's language. Returns the object it was given for a protocol that is not
 * official, so a caller may localise a whole list without telling them apart.
 */
export function localizeCard<P extends CardTexts>(t: OfficialT, card: P): P {
  const slug = officialSlug(card);
  if (!slug) return card;
  const out: CardTexts = { ...card, title: officialTitle(t, slug, card.title) };
  if ("summary" in card)
    out.summary = lookupOptional(t, `${slug}.summary`, card.summary);
  if ("description" in card)
    out.description = lookupOptional(
      t,
      `${slug}.description`,
      card.description
    );
  if ("content_warning" in card)
    out.content_warning = lookupOptional(
      t,
      `${slug}.contentWarning`,
      card.content_warning
    );
  return out as P;
}

/** A block's label by its id in the tree; loop copies share the id, so the label. */
export function blockLabel(
  t: OfficialT,
  slug: string,
  blockId: string,
  stored: string
): string {
  return lookup(t, `${slug}.blocks.${blockId}.label`, stored);
}

/** The label of a loop or a named sequence, by its node id. */
export function groupLabel(
  t: OfficialT,
  slug: string,
  nodeId: string,
  stored: string
): string {
  return lookup(t, `${slug}.groups.${nodeId}.label`, stored);
}

/**
 * The strings of a block config a participant reads, each with its dotted path
 * (`lines.0.text`). The one definition of "translatable" in a config: `localizeConfig`
 * replaces exactly these and the catalogue test demands a key for exactly these.
 */
export function displayStrings(
  config: unknown,
  path: readonly string[] = []
): [path: string, text: string][] {
  if (typeof config === "string")
    return isDisplayPath(path) ? [[path.join("."), config]] : [];
  if (Array.isArray(config))
    return config.flatMap((item, index) =>
      displayStrings(item, [...path, String(index)])
    );
  if (config !== null && typeof config === "object")
    return Object.entries(config).flatMap(([key, value]) =>
      displayStrings(value, [...path, key])
    );
  return [];
}

function localizeValue(
  t: OfficialT,
  prefix: string,
  value: unknown,
  path: readonly string[]
): unknown {
  if (typeof value === "string")
    return isDisplayPath(path)
      ? lookup(t, `${prefix}.${path.join(".")}`, value)
      : value;
  if (Array.isArray(value)) {
    const next = value.map((item, index) =>
      localizeValue(t, prefix, item, [...path, String(index)])
    );
    return next.some((item, index) => item !== value[index]) ? next : value;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    const next = entries.map(
      ([key, item]) =>
        [key, localizeValue(t, prefix, item, [...path, key])] as const
    );
    return next.some(([, item], index) => item !== entries[index][1])
      ? Object.fromEntries(next)
      : value;
  }
  return value;
}

/**
 * A copy of a block's config with every string a participant reads replaced by the
 * catalogue's, where it has one; everything else - numbers, modes, marker names - is the
 * same value. The input is never mutated, and comes back as it is (same reference) when
 * nothing had a key. Works on a tree's config and on a resolved step's alike: parsing
 * adds defaults but keeps the paths.
 */
export function localizeConfig<C>(
  t: OfficialT,
  slug: string,
  blockId: string,
  config: C
): C {
  return localizeValue(t, `${slug}.blocks.${blockId}.config`, config, []) as C;
}

/**
 * The tree block a resolved step came from: its `block.block_id`, or - for the fixation
 * and the rest `resolvePlan` inserts around a block, which carry no provenance - the
 * step id without its `~<iteration>` and `__pre`/`__post` suffixes.
 */
export function blockIdOfStep(step: StepTexts): string {
  return (
    step.block?.block_id ??
    step.id.replace(/__(pre|post)$/, "").replace(/(~\d+)+$/, "")
  );
}

/**
 * A plan step as a person should read it: its label, and its config when the step is
 * the block itself (an inserted fixation or rest has a config of its own, not the
 * block's). A copy for display only - the step that is run, posted and stamped on
 * events stays the one it was given.
 */
export function localizeStep<S extends StepTexts>(
  t: OfficialT,
  slug: string,
  step: S
): S {
  const blockId = blockIdOfStep(step);
  const label =
    typeof step.label === "string"
      ? blockLabel(t, slug, blockId, step.label)
      : step.label;
  const config = step.block
    ? localizeConfig(t, slug, blockId, step.config)
    : step.config;
  return label === step.label && config === step.config
    ? step
    : { ...step, label, config };
}

/** The manifest's warning and consent text, for the gate before a run. */
export function localizeManifest<M extends ManifestTexts>(
  t: OfficialT,
  slug: string,
  manifest: M
): M {
  return {
    ...manifest,
    content_warning: lookupOptional(
      t,
      `${slug}.contentWarning`,
      manifest.content_warning
    ),
    consent_text: lookupOptional(
      t,
      `${slug}.consentText`,
      manifest.consent_text
    ),
  };
}

interface TopNode {
  type?: string;
  id?: string;
  label?: unknown;
}

/**
 * The detail page's outline with each line's label localised.
 *
 * An `OutlineItem` has no id: the backend writes one line per top-level node of the
 * tree, in order, so line `i` is matched to `definition.root.children[i]` - a block by
 * its id, a loop or a sequence by its own. An outline that does not line up with the
 * tree (a different version, a tree that does not parse) is returned as stored.
 */
export function localizeOutline(
  t: OfficialT,
  slug: string,
  definition: unknown,
  outline: readonly OutlineItem[]
): OutlineItem[] {
  const children = (definition as { root?: { children?: unknown } } | null)
    ?.root?.children;
  if (!Array.isArray(children) || children.length !== outline.length)
    return [...outline];
  return outline.map((item, index) => {
    const node = children[index] as TopNode | null;
    if (!node?.id || typeof node.label !== "string") return item;
    const label =
      node.type === "block"
        ? blockLabel(t, slug, node.id, item.label)
        : groupLabel(t, slug, node.id, item.label);
    return label === item.label ? item : { ...item, label };
  });
}

/** A protocol's detail for display: the card's texts and the outline. */
export function localizeDetail<P extends DetailTexts>(
  t: OfficialT,
  detail: P
): P {
  const slug = officialSlug(detail);
  if (!slug) return detail;
  return {
    ...localizeCard(t, detail),
    outline: localizeOutline(t, slug, detail.definition, detail.outline),
  };
}

/**
 * Every translatable string of a stored tree, keyed as the catalogue keys it under
 * `official.<slug>` (`contentWarning`, `blocks.<id>.label`, `blocks.<id>.config.<path>`,
 * `groups.<id>.label`). A label or a text given as a `$var` reference is a loop column,
 * not a string, and is skipped. This is what the catalogue test compares with
 * `messages/en.json`, so a template edited later fails until its keys follow.
 */
export function treeStrings(tree: unknown): [key: string, text: string][] {
  const out: [string, string][] = [];
  const { manifest, root } = (tree ?? {}) as {
    manifest?: Partial<ManifestTexts>;
    root?: unknown;
  };
  if (typeof manifest?.content_warning === "string")
    out.push(["contentWarning", manifest.content_warning]);
  if (typeof manifest?.consent_text === "string")
    out.push(["consentText", manifest.consent_text]);

  const walk = (value: unknown) => {
    const node = value as
      | (TopNode & {
          config?: unknown;
          children?: unknown[];
          template?: unknown;
        })
      | null;
    if (!node || typeof node !== "object") return;
    if (node.type === "block") {
      if (!node.id) return;
      if (typeof node.label === "string")
        out.push([`blocks.${node.id}.label`, node.label]);
      for (const [path, text] of displayStrings(node.config))
        out.push([`blocks.${node.id}.config.${path}`, text]);
      return;
    }
    if (node.id && typeof node.label === "string" && node.label)
      out.push([`groups.${node.id}.label`, node.label]);
    if (node.type === "loop") walk(node.template);
    else (node.children ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

/** The helpers above, bound to the reader's language. */
export interface OfficialTexts {
  /** A card or a detail with its catalog texts localised (identity if not official). */
  card: <P extends CardTexts>(card: P) => P;
  /** A detail with its catalog texts and its outline localised. */
  detail: <P extends DetailTexts>(detail: P) => P;
  /** The title of the protocol with this slug; `slug` null means "not official". */
  title: (slug: string | null | undefined, stored: string) => string;
  blockLabel: (
    slug: string | null | undefined,
    blockId: string,
    stored: string
  ) => string;
  manifest: <M extends ManifestTexts>(
    slug: string | null | undefined,
    manifest: M
  ) => M;
  /** A plan step for display; the step itself when `slug` is null. */
  step: <S extends StepTexts>(slug: string | null | undefined, step: S) => S;
}

/**
 * The official protocols' texts for a component. Every helper takes the slug of an
 * official protocol (`officialSlug(detail)`) and is the identity when it is null, so a
 * display site reads the same whether the protocol is ours or somebody's own.
 *
 * The returned object is stable for a language, so it is safe in dependency lists.
 */
export function useOfficialTexts(): OfficialTexts {
  const t = useTranslations("official");
  const stored = useLocale() === DEFAULT_LOCALE;
  return useMemo<OfficialTexts>(
    () =>
      stored
        ? AS_STORED
        : {
            card: (card) => localizeCard(t, card),
            detail: (detail) => localizeDetail(t, detail),
            title: (slug, stored) =>
              slug ? officialTitle(t, slug, stored) : stored,
            blockLabel: (slug, blockId, stored) =>
              slug ? blockLabel(t, slug, blockId, stored) : stored,
            manifest: (slug, manifest) =>
              slug ? localizeManifest(t, slug, manifest) : manifest,
            step: (slug, step) => (slug ? localizeStep(t, slug, step) : step),
          },
    [stored, t]
  );
}

/** The reference language: every text is shown exactly as stored. */
const AS_STORED: OfficialTexts = {
  card: (card) => card,
  detail: (detail) => detail,
  title: (_slug, stored) => stored,
  blockLabel: (_slug, _blockId, stored) => stored,
  manifest: (_slug, manifest) => manifest,
  step: (_slug, step) => step,
};

/** The official protocol a session ran: its slug and the title it is stored under. */
export interface SessionProtocol {
  slug: string;
  title: string;
}

/**
 * The official protocol behind a session, for a page that reads a session back.
 *
 * A session knows only its `protocol_id`; whether that protocol is official, and its
 * slug, are on the protocol. One request, shared with the protocol's own page (same
 * query key) and kept for the visit.
 *
 * `undefined` while the answer is on its way, so a page can wait rather than show one
 * language and then the other. `null` when there is nothing to localise: no protocol
 * id, a protocol that is not official, or one that cannot be read at all (deleted, or
 * no longer shared: 404/403) - the page then shows the stored text.
 */
export function useSessionProtocol(
  protocolId: string | null | undefined
): SessionProtocol | null | undefined {
  // In English everything is shown as stored: nothing to ask, nothing to wait for.
  const stored = useLocale() === DEFAULT_LOCALE;
  const detail = useQuery({
    queryKey: ["protocol", protocolId],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${protocolId}`),
    enabled: Boolean(protocolId) && !stored,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const slug = officialSlug(detail.data);
  const title = detail.data?.title;
  const found = useMemo(
    () => (slug && typeof title === "string" ? { slug, title } : null),
    [slug, title]
  );
  return detail.isLoading ? undefined : found;
}

/** The catalog request, shared by the catalog page and the lists that name protocols. */
export const CATALOG_QUERY = {
  queryKey: ["protocols", "catalog"],
  queryFn: () =>
    api.get<ProtocolCard[]>("protocols?include_locked=true&limit=100"),
} as const;

/**
 * A recording's title in the reader's language, for a list of recordings.
 *
 * A protocol run names its recording after the protocol, and a list row carries neither
 * the protocol's id nor its slug. So a row is matched by what it does carry: it came
 * from a session (`session_id`; an uploaded file was titled by hand) and its title is
 * still, word for word, the stored title of an official protocol in the catalog. A
 * recording renamed since, or run from a person's own protocol, is shown as stored -
 * as is everything while the catalog is loading or if it cannot be read.
 */
export function useRecordingTitle(): (recording: {
  title: string;
  session_id?: string | null;
}) => string {
  const t = useTranslations("official");
  // In English a title is shown as stored, so there is no catalog to ask.
  const stored = useLocale() === DEFAULT_LOCALE;
  const catalog = useQuery({
    ...CATALOG_QUERY,
    enabled: !stored,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const slugByTitle = useMemo(() => {
    const out = new Map<string, string>();
    if (!Array.isArray(catalog.data)) return out;
    for (const card of catalog.data) {
      const slug = officialSlug(card);
      if (slug && typeof card.title === "string") out.set(card.title, slug);
    }
    return out;
  }, [catalog.data]);
  return useCallback(
    (recording) => {
      const slug = recording.session_id
        ? slugByTitle.get(recording.title)
        : undefined;
      return slug ? officialTitle(t, slug, recording.title) : recording.title;
    },
    [slugByTitle, t]
  );
}
