/**
 * Every locale file says the same things as the English one.
 *
 * `messages.d.ts` type-checks `t("...")` against `en.json` only, so nothing at compile
 * time notices a key that was added in English and forgotten elsewhere - the page would
 * print the key's name to whoever reads that language. These tests are that check: the
 * same keys, the same ICU arguments (a translated sentence that drops `{name}` or turns
 * a plural into plain text formats wrongly or throws), the same rich-text tags.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { expect, test } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

type Catalogue = { [key: string]: string | Catalogue };

function read(locale: string): Catalogue {
  const file = path.resolve(__dirname, `../../messages/${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

function load(locale: string): Record<string, string> {
  return flatten(read(locale));
}

function flatten(node: Catalogue, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

/**
 * The arguments an ICU message takes, as `name` or `name:type`, sorted.
 *
 * Walks the braces instead of matching a pattern, because the branches of a plural or a
 * select are messages themselves: in `{n, plural, one {# day} other {# days}}` the words
 * `day` and `days` sit in braces and are text, not arguments.
 */
export function icuArguments(message: string): string[] {
  const found = new Set<string>();
  let i = 0;
  const readUntil = (stops: string) => {
    let text = "";
    while (i < message.length && !stops.includes(message[i]))
      text += message[i++];
    return text.trim();
  };
  const readMessage = (nested: boolean) => {
    while (i < message.length) {
      if (message[i] === "}" && nested) return;
      if (message[i] === "{") {
        i++;
        readArgument();
      } else i++;
    }
  };
  const readArgument = () => {
    const name = readUntil(",}");
    let type = "";
    if (message[i] === ",") {
      i++;
      type = readUntil(",}");
    }
    found.add(type ? `${name}:${type}` : name);
    if (message[i] === ",") {
      i++;
      const branching = ["plural", "select", "selectordinal"].includes(type);
      while (i < message.length && message[i] !== "}") {
        if (branching && message[i] === "{") {
          i++;
          readMessage(true);
        }
        i++;
      }
    }
    i++; // the argument's closing brace
  };
  readMessage(false);
  return [...found].sort();
}

/** The rich-text tags of a message (`<link>…</link>`), sorted. */
function tags(message: string): string[] {
  return [...new Set(message.match(/<\/?[A-Za-z][\w-]*>/g) ?? [])].sort();
}

const reference = load(DEFAULT_LOCALE);
const others = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

test("icuArguments reads arguments, not the words inside plural branches", () => {
  expect(icuArguments("Connected to {name}")).toEqual(["name"]);
  expect(
    icuArguments("{n, plural, one {# recording} other {# recordings}} · {date}")
  ).toEqual(["date", "n:plural"]);
  expect(
    icuArguments("{kind, select, video {Video of {who}} other {File}}")
  ).toEqual(["kind:select", "who"]);
  expect(icuArguments("{price, number, ::currency/EUR} due")).toEqual([
    "price:number",
  ]);
  expect(icuArguments("No arguments here.")).toEqual([]);
});

test("there is a translation to check", () => {
  expect(others.length).toBeGreaterThan(0);
  expect(Object.keys(reference).length).toBeGreaterThan(0);
});

test.each(others)("%s has exactly the keys of the English file", (locale) => {
  const translated = load(locale);
  const missing = Object.keys(reference).filter((key) => !(key in translated));
  const orphans = Object.keys(translated).filter((key) => !(key in reference));
  expect({ missing, orphans }).toEqual({ missing: [], orphans: [] });
});

test.each(others)("%s leaves no message empty", (locale) => {
  const empty = Object.entries(load(locale))
    .filter(([, message]) => message.trim() === "")
    .map(([key]) => key);
  expect(empty).toEqual([]);
});

test.each(others)("%s keeps every message's arguments and tags", (locale) => {
  const translated = load(locale);
  const different = Object.keys(reference)
    .filter((key) => key in translated)
    .filter(
      (key) =>
        icuArguments(reference[key]).join() !==
          icuArguments(translated[key]).join() ||
        tags(reference[key]).join() !== tags(translated[key]).join()
    );
  expect(different).toEqual([]);
});

/** A value of the right kind for an argument, by the type the message declares. */
function sampleValue(argument: string): string | number | Date {
  const type = argument.split(":")[1];
  if (type === "plural" || type === "selectordinal" || type === "number")
    return 2;
  if (type === "date" || type === "time") return new Date(0);
  return "x";
}

test.each([...LOCALES])("every %s message formats", (locale) => {
  // An apostrophe right before a brace or a tag opens an ICU quote: `l'{name}` prints
  // the braces instead of the name, and Italian elides in front of arguments all the
  // time. Formatting each message for real is what catches that, and any other syntax
  // slip, before a reader does.
  const failures: string[] = [];
  const t = createTranslator({
    locale,
    messages: read(locale) as never,
    onError: (error) => {
      throw error;
    },
  }) as unknown as {
    markup: (key: string, values: Record<string, unknown>) => string;
  };
  for (const [key, message] of Object.entries(load(locale))) {
    const values: Record<string, unknown> = {};
    for (const argument of icuArguments(message))
      values[argument.split(":")[0]] = sampleValue(argument);
    for (const tag of tags(message))
      values[tag.replace(/[</>]/g, "")] = (chunks: string) => chunks;
    try {
      const text = t.markup(key, values);
      if (/[{}]/.test(text)) failures.push(`${key}: ${text}`);
    } catch (error) {
      failures.push(`${key}: ${(error as Error).message}`);
    }
  }
  expect(failures).toEqual([]);
});
