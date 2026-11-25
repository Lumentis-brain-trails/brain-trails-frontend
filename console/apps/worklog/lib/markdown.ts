/**
 * The small Markdown the status report is written in, parsed into blocks the page draws
 * itself: headings, paragraphs, bullet and numbered lists, rules; inside them links,
 * bold, italic and code. Nothing becomes HTML, so a report can never inject markup, and
 * a link opens only when it is `http(s)`.
 *
 * It is deliberately a subset. What it does not know (tables, images, raw HTML) is kept
 * as text, which is the honest failure for a page a person reads.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; url: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "rule" };

const INLINE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;

/** Whether a link's address is one the page may open. */
export function safeUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

/** One line of text as its inline runs, in order; plain text between the marks. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    const [, linkText, url, strong, code, star, under] = m;
    if (linkText !== undefined && url !== undefined) {
      if (safeUrl(url)) out.push({ kind: "link", text: linkText, url });
      else out.push({ kind: "text", text: linkText });
    } else if (strong !== undefined) out.push({ kind: "strong", text: strong });
    else if (code !== undefined) out.push({ kind: "code", text: code });
    else out.push({ kind: "em", text: (star ?? under) as string });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const HEADING = /^(#{1,4})\s+(.*\S)\s*$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;

/** The report as blocks, top to bottom; blank lines end a paragraph or a list. */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({
        kind: "paragraph",
        inlines: parseInline(paragraph.join(" ")),
      });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({
        kind: "list",
        ordered: list.ordered,
        items: list.items.map(parseInline),
      });
      list = null;
    }
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4,
        inlines: parseInline(heading[2]),
      });
      continue;
    }
    if (RULE.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "rule" });
      continue;
    }
    const bullet = BULLET.exec(trimmed);
    const numbered = bullet ? null : NUMBERED.exec(trimmed);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item[1]);
      continue;
    }
    if (list && /^\s+/.test(line)) {
      // An indented line continues the item above it.
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return blocks;
}
