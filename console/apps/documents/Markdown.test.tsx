import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Markdown, safeHref } from "./Markdown";

afterEach(cleanup);

describe("a document's Markdown", () => {
  test("headings, lists, tables, code and task lists are drawn", () => {
    const { container } = render(
      <Markdown
        text={[
          "# Title",
          "",
          "Some **bold** and `code`.",
          "",
          "- one",
          "- [x] done",
          "",
          "| a | b |",
          "|---|---|",
          "| 1 | 2 |",
          "",
          "```",
          "x = 1",
          "```",
        ].join("\n")}
      />
    );
    expect(container.querySelector("h2")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("pre")?.textContent).toContain("x = 1");
    const box = container.querySelector("input[type=checkbox]");
    expect(box).not.toBeNull();
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  test("raw HTML is dropped, never rendered", () => {
    const { container } = render(
      <Markdown
        text={
          'Hi <script>alert(1)</script><b onclick="x()">b</b>\n\n<iframe src="https://e.com"></iframe>'
        }
      />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("onclick");
  });

  test("links keep only safe addresses; images become links", () => {
    const { container } = render(
      <Markdown
        text={
          "[ok](https://example.com) [bad](javascript:alert(1)) [rel](/apps/x) ![pic](https://example.com/p.png)"
        }
      />
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com",
      "https://example.com/p.png",
    ]);
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("bad");
    expect(container.textContent).toContain("pic");
  });

  test("safeHref allows the web, mail and in-page anchors", () => {
    expect(safeHref("https://a.b/c")).toBe("https://a.b/c");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeHref("#section-2")).toBe("#section-2");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "/apps/x",
      "//evil.com",
      "vbscript:x",
    ])
      expect(safeHref(bad), bad).toBeNull();
  });
});
