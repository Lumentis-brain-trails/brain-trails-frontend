import { describe, expect, test } from "vitest";
import { parseInline, parseMarkdown, safeUrl } from "./markdown";

describe("the status report's Markdown", () => {
  test("headings, paragraphs, lists and rules become blocks", () => {
    const blocks = parseMarkdown(
      [
        "## Where we are",
        "",
        "Prod runs on Hetzner",
        "since Sunday.",
        "",
        "- one",
        "- two",
        "  continued",
        "* three",
        "",
        "1. first",
        "2) second",
        "",
        "---",
        "#### Deep",
      ].join("\n")
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "rule",
      "heading",
    ]);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      inlines: [{ kind: "text", text: "Where we are" }],
    });
    expect(blocks[1]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "Prod runs on Hetzner since Sunday." }],
    });
    const bullets = blocks[2];
    expect(bullets.kind === "list" && !bullets.ordered).toBe(true);
    expect(
      bullets.kind === "list" && bullets.items.map((i) => i[0].text)
    ).toEqual(["one", "two continued", "three"]);
    const numbered = blocks[3];
    expect(numbered.kind === "list" && numbered.ordered).toBe(true);
    expect(blocks[5]).toMatchObject({ kind: "heading", level: 4 });
  });

  test("a list directly followed by text ends the list", () => {
    const blocks = parseMarkdown("- a\nplain");
    expect(blocks.map((b) => b.kind)).toEqual(["list", "paragraph"]);
  });

  test("inline marks: links (http only), bold, italic, code", () => {
    expect(
      parseInline(
        "See [the paper](https://arxiv.org/abs/2312.04528), **bold**, *em*, _em2_ and `code`."
      )
    ).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "the paper", url: "https://arxiv.org/abs/2312.04528" },
      { kind: "text", text: ", " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: ", " },
      { kind: "em", text: "em" },
      { kind: "text", text: ", " },
      { kind: "em", text: "em2" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: "." },
    ]);
    // A link that is not http(s) keeps its text and loses its address.
    expect(parseInline("[x](javascript:alert)")).toEqual([
      { kind: "text", text: "x" },
    ]);
    expect(safeUrl("https://a.b/c")).toBe(true);
    expect(safeUrl("ftp://a.b")).toBe(false);
    // Underscores inside words are not emphasis.
    expect(parseInline("snake_case_name")).toEqual([
      { kind: "text", text: "snake_case_name" },
    ]);
  });

  test("nothing is HTML: tags stay text", () => {
    expect(parseMarkdown("<b>hi</b>")).toEqual([
      { kind: "paragraph", inlines: [{ kind: "text", text: "<b>hi</b>" }] },
    ]);
    expect(parseMarkdown("")).toEqual([]);
  });
});
