import { describe, expect, test } from "vitest";
import {
  type DocumentDraft,
  MAX_BODY,
  checkDraft,
  checkToken,
  isSlug,
  listPath,
  nextStatuses,
  scopeKey,
  slugify,
  tokenActive,
  tokenRequest,
} from "./documents";

const DRAFT: DocumentDraft = {
  slug: "",
  title: "Roadmap report for Gabriella",
  kind: "report",
  audience: "Gabriella",
  body: "# Hello",
  note: "First draft",
};

describe("document addresses", () => {
  test("lowercase words joined by single hyphens", () => {
    expect(isSlug("roadmap-report")).toBe(true);
    expect(isSlug("q4-2026")).toBe(true);
    for (const bad of ["", "Roadmap", "a--b", "-a", "a-", "a b", "a/b", "à"])
      expect(isSlug(bad), bad).toBe(false);
    expect(isSlug("a".repeat(81))).toBe(false);
  });

  test("a slug is suggested from the title", () => {
    expect(slugify("Roadmap report for Gabriella")).toBe(
      "roadmap-report-for-gabriella"
    );
    expect(slugify("  Analisi: qualità del segnale (Q4)! ")).toBe(
      "analisi-qualita-del-segnale-q4"
    );
    expect(slugify("!!!")).toBe("");
    const long = slugify("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(isSlug(long)).toBe(true);
  });
});

describe("the list's query", () => {
  test("only the filters that are set, the search trimmed", () => {
    expect(listPath({ kind: "", status: "", q: "  " })).toBe("documents");
    expect(listPath({ kind: "report", status: "final", q: " road map " })).toBe(
      "documents?kind=report&status=final&q=road+map"
    );
    expect(listPath({ kind: "", status: "archived", q: "" })).toBe(
      "documents?status=archived"
    );
  });
});

describe("a draft before it is saved", () => {
  test("a complete draft has no errors", () => {
    expect(checkDraft(DRAFT, true)).toEqual({});
    expect(checkDraft({ ...DRAFT, slug: "my-doc" }, true)).toEqual({});
  });

  test("every field says what is wrong with it", () => {
    expect(
      checkDraft(
        { ...DRAFT, title: " ", audience: "", note: "", slug: "Bad Slug" },
        true
      )
    ).toEqual({
      title: "titleRequired",
      audience: "audienceRequired",
      note: "noteRequired",
      slug: "slugInvalid",
    });
    expect(
      checkDraft(
        {
          ...DRAFT,
          title: "t".repeat(201),
          audience: "a".repeat(121),
          note: "n".repeat(201),
          body: "b".repeat(MAX_BODY + 1),
        },
        false
      )
    ).toEqual({
      title: "titleTooLong",
      audience: "audienceTooLong",
      note: "noteTooLong",
      body: "bodyTooLong",
    });
  });

  test("an existing document's slug is not checked: it is not sent", () => {
    expect(checkDraft({ ...DRAFT, slug: "Old Slug" }, false)).toEqual({});
  });

  test("a status moves to any other status", () => {
    expect(nextStatuses("draft")).toEqual(["final", "archived"]);
    expect(nextStatuses("archived")).toEqual(["draft", "final"]);
  });
});

describe("access tokens", () => {
  test("a name and at least one scope", () => {
    expect(
      checkToken({ name: "Claude, Mac", scopes: ["documents:read"], days: 30 })
    ).toEqual({});
    expect(checkToken({ name: " ", scopes: [], days: 30 })).toEqual({
      name: "nameRequired",
      scopes: "scopesRequired",
    });
    expect(
      checkToken({ name: "x".repeat(81), scopes: ["documents:write"], days: 7 })
        .name
    ).toBe("nameTooLong");
  });

  test("the request keeps scope order and the expiry within 90 days", () => {
    expect(
      tokenRequest({
        name: " Claude ",
        scopes: ["documents:write", "documents:read"],
        days: 365,
      })
    ).toEqual({
      name: "Claude",
      scopes: ["documents:read", "documents:write"],
      expires_in_days: 90,
    });
    expect(
      tokenRequest({ name: "c", scopes: ["documents:read"], days: 0 })
        .expires_in_days
    ).toBe(1);
  });

  test("a scope's words are keyed by what it allows", () => {
    expect(scopeKey("documents:read")).toBe("read");
    expect(scopeKey("documents:write")).toBe("write");
  });

  test("a token is active until revoked or expired", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    expect(
      tokenActive({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, now)
    ).toBe(true);
    expect(
      tokenActive({ revoked_at: null, expires_at: "2026-11-01T00:00:00Z" }, now)
    ).toBe(false);
    expect(
      tokenActive(
        {
          revoked_at: "2026-11-20T00:00:00Z",
          expires_at: "2026-12-01T00:00:00Z",
        },
        now
      )
    ).toBe(false);
  });
});
