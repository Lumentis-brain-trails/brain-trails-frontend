/**
 * The console's Italian says what its English says: same keys, same ICU arguments.
 * Every message also formats with next-intl (a broken plural throws here, not in a page).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { expect, test } from "vitest";

type Catalogue = { [key: string]: string | Catalogue };

const read = (locale: string): Catalogue =>
  JSON.parse(
    readFileSync(
      path.resolve(__dirname, `../../messages/${locale}.json`),
      "utf8"
    )
  );

function flatten(node: Catalogue, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

/** The top-level argument names of a message, sorted. */
function args(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    if (message[i] === "{") {
      if (depth === 0)
        names.add(
          message
            .slice(i + 1)
            .split(/[,}]/)[0]
            .trim()
        );
      depth++;
    } else if (message[i] === "}") depth--;
  }
  return [...names].sort();
}

const en = flatten(read("en"));
const it = flatten(read("it"));

test("Italian has exactly the English keys", () => {
  expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort());
});

test("every message takes the same arguments in both languages and formats", () => {
  for (const [key, message] of Object.entries(en)) {
    expect(args(it[key]), key).toEqual(args(message));
    const values = Object.fromEntries(args(message).map((a) => [a, 2]));
    for (const [locale, catalogue] of [
      ["en", read("en")],
      ["it", read("it")],
    ] as const) {
      const t = createTranslator({ locale, messages: catalogue });
      expect(
        () => t(key as never, values as never),
        `${locale} ${key}`
      ).not.toThrow();
    }
  }
});
