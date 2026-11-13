import { describe, expect, it } from "vitest";
import { envKey, importUrl, tokenFromHash } from "./transfers";

describe("transfer links", () => {
  it("puts the token in the fragment, never in the query", () => {
    const url = importUrl("https://dev.lumentis.online/", "beta", "a b/c");
    expect(url).toBe(
      "https://dev.lumentis.online/account/import?from=beta#t=a%20b%2Fc"
    );
    expect(new URL(url).search).not.toContain("a%20b");
  });

  it("reads the token back from the fragment", () => {
    const url = new URL(importUrl("https://dev.example", "prod", "tok-123_x"));
    expect(tokenFromHash(url.hash)).toBe("tok-123_x");
    expect(tokenFromHash("#x=1&t=abc")).toBe("abc");
    expect(tokenFromHash("")).toBe("");
    expect(tokenFromHash("#t=%E0%A4%A")).toBe("");
  });

  it("names only the environments it knows", () => {
    expect(envKey("dev")).toBe("dev");
    expect(envKey("prod")).toBe("prod");
    expect(envKey("local")).toBe("other");
  });
});
