import { createTranslator } from "next-intl";
import { expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import blocks from "../../../schemas/blocks.schema.json";
import {
  type FieldWords,
  docFor,
  docKey,
  documentedSettings,
  present,
} from "./fieldDocs";
import { describeFields, type JsonSchema } from "./fields";

type Schema = Record<string, unknown>;

/** One setting's words as the catalogue holds them. */
interface Words {
  label?: string;
  help?: string;
  options?: Record<string, string>;
}
type Catalogue = Record<string, Record<string, Words>>;

/** The field documentation of one catalogue, read the way `useFieldWords` reads it. */
function wordsOf(locale: "en" | "it", messages: typeof en): FieldWords {
  const t = createTranslator({ locale, messages, namespace: "builder.fields" });
  return (key) => (t.has(key as never) ? t(key as never) : undefined);
}
const english = wordsOf("en", en);

/** Every setting path a kind's schema declares, unions and list rows included. */
function paths(schema: Schema, base: string[] = [], out = new Set<string>()) {
  const properties = (schema.properties ?? {}) as Record<string, Schema>;
  for (const [name, child] of Object.entries(properties)) {
    out.add([...base, name].join("."));
    paths(child, [...base, name], out);
  }
  for (const key of ["oneOf", "anyOf"] as const)
    for (const option of (schema[key] ?? []) as Schema[])
      paths(option, base, out);
  if (schema.items && !Array.isArray(schema.items))
    paths(schema.items as Schema, base, out);
  return out;
}

test("every setting of every kind is explained", () => {
  const kinds = (blocks as { kinds: Record<string, Schema> }).kinds;
  const gaps: string[] = [];
  for (const [kind, schema] of Object.entries(kinds))
    for (const path of paths(schema))
      if (!docFor(kind, path.split("."))) gaps.push(`${kind}: ${path}`);
  // a new schema property lands here until someone writes its name and its help
  expect(gaps).toEqual([]);
});

test("every documented setting has its words, and no words are left without a setting", () => {
  const catalogue = en.builder.fields as Catalogue;
  const documented = documentedSettings();
  const unworded: string[] = [];
  for (const [scope, setting] of documented) {
    const words = catalogue[scope]?.[setting];
    const hidden = docFor(scope, setting.split("/"))?.hidden === true;
    // a hidden setting is never drawn; every other one needs a name or an explanation
    if (!hidden && !words?.label && !words?.help)
      unworded.push(`${scope}.${setting}`);
  }
  expect(unworded).toEqual([]);

  const known = new Set(
    documented.map(([scope, setting]) => `${scope}.${setting}`)
  );
  const orphans: string[] = [];
  for (const [scope, settings] of Object.entries(catalogue))
    for (const setting of Object.keys(settings))
      if (!known.has(`${scope}.${setting}`))
        orphans.push(`${scope}.${setting}`);
  // words whose setting was renamed or removed would never be shown
  expect(orphans).toEqual([]);
});

test("every choice of a select is worded", () => {
  const kinds = (blocks as { kinds: Record<string, JsonSchema> }).kinds;
  const raw: string[] = [];
  const visit = (kind: string, schema: JsonSchema, base: string[]) => {
    for (const field of present(
      kind,
      describeFields(schema, {}),
      english,
      base
    )) {
      const path = [...base, ...field.path];
      for (const option of field.options ?? [])
        if (!field.optionLabels?.[option])
          raw.push(`${kind}: ${path.join(".")} = ${option}`);
      if (field.itemSchema) visit(kind, field.itemSchema, path);
    }
  };
  for (const [kind, schema] of Object.entries(kinds)) visit(kind, schema, []);
  // a value listed here is shown to the author as its wire name
  expect(raw).toEqual([]);
});

test("the Italian documentation words exactly what the English does", () => {
  const leaves = (node: unknown, prefix = ""): string[] =>
    typeof node === "string"
      ? [prefix]
      : Object.entries(node as Record<string, unknown>).flatMap(
          ([key, child]) => leaves(child, `${prefix}\u0000${key}`)
        );
  expect(leaves(it.builder.fields).sort()).toEqual(
    leaves(en.builder.fields).sort()
  );
  // typed loosely: this test holds the two catalogues together only under `fields`
  const italian = wordsOf("it", it as unknown as typeof en);
  expect(italian("video.endOn.options.ended")).toBe("Quando finisce il video");
  expect(italian("common.lines/text.label")).toBe("Testo");
});

test("list indexes are not part of a setting's name", () => {
  expect(docKey(["lines", "0", "text"])).toBe("lines.text");
});

test("a block's form starts with what an author needs", () => {
  const schema = (blocks as { kinds: Record<string, JsonSchema> }).kinds.video;
  const fields = present(
    "video",
    describeFields(schema, { media_id: "m1", endOn: "ended" }),
    english
  );
  const labels = fields.map((field) => field.label);
  // the builder fills the media in; nobody types an id
  expect(labels).not.toContain("Media");
  expect(labels).toContain("The participant can pause");
  const cues = fields.find((field) => field.path[0] === "cues");
  expect(cues?.advanced).toBe(true);
  const endOn = fields.find((field) => field.path[0] === "endOn");
  expect(endOn?.optionLabels?.ended).toBe("When the video ends");
  expect(endOn?.description).toMatch(/finishes/);
});

test("a row of a list is worded by its path under the list", () => {
  const [text] = present(
    "instructions",
    [{ path: ["text"], label: "Text", kind: "textarea", required: true }],
    english,
    ["lines"]
  );
  expect(text.description).toMatch(/new line on screen/);
  expect(text.advanced).toBe(false);
});

test("an event name keeps its derived name and gets the shared explanation", () => {
  const [marker] = present(
    "go-no-go",
    [
      {
        path: ["markers", "trialStart"],
        label: "Markers.Trial start",
        kind: "text",
        required: false,
      },
    ],
    english
  );
  expect(marker.label).toBe("Markers.Trial start");
  expect(marker.description).toMatch(/event timeline/);
  expect(marker.advanced).toBe(true);
});

test("without words a setting keeps what the schema gave it", () => {
  const silent: FieldWords = () => undefined;
  const [endOn] = present(
    "video",
    [
      {
        path: ["endOn"],
        label: "End on",
        kind: "enum",
        options: ["ended", "duration"],
        required: false,
        description: "from the schema",
      },
    ],
    silent
  );
  expect(endOn.label).toBe("End on");
  expect(endOn.description).toBe("from the schema");
  expect(endOn.optionLabels).toBeUndefined();
  // the facts do not depend on the words: this one is still an advanced setting
  expect(endOn.advanced).toBe(true);
  // and a setting nobody documented is advanced, under its derived name
  const [unknown] = present(
    "video",
    [{ path: ["brandNew"], label: "Brand new", kind: "text", required: false }],
    english
  );
  expect(unknown).toMatchObject({ label: "Brand new", advanced: true });
});
