import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import {
  type OfficialT,
  blockIdOfStep,
  blockLabel,
  displayStrings,
  isOfficial,
  localizeCard,
  localizeConfig,
  localizeDetail,
  localizeManifest,
  localizeOutline,
  localizeStep,
  officialSlug,
  treeStrings,
  useOfficialTexts,
  useRecordingTitle,
  useSessionProtocol,
} from "./official";
import { resolvePlan } from "./resolve";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (p: string) => get(p) } }));

type Catalogue = { [key: string]: string | Catalogue };

const translator = (locale: "en" | "it") =>
  createTranslator({
    locale,
    messages: locale === "en" ? en : it,
    namespace: "official",
  }) as unknown as OfficialT;
const tEn = translator("en");
const tIt = translator("it");

function flatten(node: Catalogue, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") out[prefix + key] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

const DIR = path.resolve(process.cwd(), "schemas/templates");
const SLUGS = readdirSync(DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();
const template = (slug: string): unknown =>
  JSON.parse(readFileSync(path.join(DIR, `${slug}.json`), "utf8"));

/**
 * The locked "coming soon" cards. Their titles and their one summary live in the
 * backend (`app/protocols/templates.py`: `PLACEHOLDERS`, `placeholder_slug`), which
 * publishes each with the Free recording tree; the keys are copied from there by hand.
 */
const PLACEHOLDERS = [
  "coming-task-switching",
  "coming-attentional-blink",
  "coming-threat-detection",
  "coming-visual-oddballs",
  "coming-paired-associates",
];

/** Keys the frontend cannot check against a file: they are the backend's `TEMPLATES`. */
const CATALOG_KEYS = ["title", "summary", "description"];

describe("the catalogue follows the templates", () => {
  const official = en.official as unknown as Record<string, Catalogue>;

  test.each(SLUGS)(
    "%s: every translatable string has its key, with the template's words",
    (slug) => {
      const expected = Object.fromEntries(treeStrings(template(slug)));
      const keyed = flatten(official[slug] ?? {});
      for (const key of CATALOG_KEYS) delete keyed[key];
      // Both ways: a string without a key would stay English for everyone, and a key
      // without a string is a translation of something that is no longer shown.
      expect(keyed).toEqual(expected);
    }
  );

  test.each(SLUGS)("%s: its keys render the template's words", (slug) => {
    // Through the translator, not the file: a brace or a tag in a template would be
    // read as message syntax, and the participant would see something else.
    for (const [key, text] of treeStrings(template(slug)))
      expect(tEn(`${slug}.${key}` as never), key).toBe(text);
  });

  test.each(SLUGS)("%s has a title, a summary and a description", (slug) => {
    for (const key of CATALOG_KEYS)
      expect(tEn.has(`${slug}.${key}` as never), key).toBe(true);
  });

  test("the placeholders have a title, a summary and the Free recording block", () => {
    const tree = Object.fromEntries(treeStrings(template("free-recording")));
    for (const slug of PLACEHOLDERS) {
      const keyed = flatten(official[slug] ?? {});
      expect(Object.keys(keyed).sort(), slug).toEqual(
        ["summary", "title", ...Object.keys(tree)].sort()
      );
      for (const [key, text] of Object.entries(tree))
        expect(keyed[key], `${slug}.${key}`).toBe(text);
    }
  });

  test("nothing is keyed for a protocol that does not exist", () => {
    expect(Object.keys(official).sort()).toEqual(
      [...SLUGS, ...PLACEHOLDERS].sort()
    );
  });

  test("the Italian keeps every line break: they are the screen's layout", () => {
    const english = flatten(en.official as unknown as Catalogue);
    const italian = flatten(it.official as unknown as Catalogue);
    const lines = (text: string) => text.split("\n").length;
    const different = Object.keys(english).filter(
      (key) => lines(english[key]) !== lines(italian[key] ?? "")
    );
    expect(different).toEqual([]);
  });

  test("the closing footnote says what the runner's own disclaimer says", () => {
    // Two sentences a participant reads minutes apart; in Italian they must be built
    // the same way ("non è … né una diagnosi medica").
    const footnote = tIt(
      "signal-navigator.blocks.outro.config.footnote" as never
    );
    expect(footnote).toMatch(/né una diagnosi medica\.$/);
    expect(it.run.runner.disclaimer).toContain("né una diagnosi medica.");
  });

  test("what is recorded is never listed as translatable", () => {
    const strings = SLUGS.flatMap((slug) =>
      treeStrings(template(slug)).map(([key]) => key)
    );
    expect(
      strings.filter((key) => /markers|\.marker$|media_id|choices/.test(key))
    ).toEqual([]);
  });
});

describe("displayStrings", () => {
  test("finds what a participant reads and nothing that is recorded", () => {
    expect(
      displayStrings({
        lines: [
          { text: "One", marker: "rule_shown", holdMs: 100 },
          { text: "Two" },
        ],
        advance: { mode: "key", label: "Start" },
        footnote: "Note",
        markers: { trialStart: "trial_start" },
        cues: [{ atS: 1, label: "scene_2", note: "cut" }],
        items: [
          {
            id: "q1",
            text: "How?",
            anchors: ["Low", "High"],
            choices: ["A", "B"],
          },
        ],
        scenes: [{ prompt: "Which?", choices: ["A", "B"] }],
        media_id: { $var: "clip" },
        eyes: "closed",
      })
    ).toEqual([
      ["lines.0.text", "One"],
      ["lines.1.text", "Two"],
      ["advance.label", "Start"],
      ["footnote", "Note"],
      ["items.0.text", "How?"],
      ["items.0.anchors.0", "Low"],
      ["items.0.anchors.1", "High"],
      ["scenes.0.prompt", "Which?"],
    ]);
  });
});

describe("official texts", () => {
  const card = {
    slug: "signal-navigator",
    visibility: "official",
    title: "Signal Navigator",
    summary: "A go/no-go attention game with paced breathing.",
    content_warning: "stored warning",
  };

  test("official is a visibility, and the slug is only read for it", () => {
    expect(isOfficial(card)).toBe(true);
    expect(isOfficial({ visibility: "workspace" })).toBe(false);
    expect(isOfficial(null)).toBe(false);
    expect(officialSlug(card)).toBe("signal-navigator");
    expect(officialSlug({ ...card, visibility: "public" })).toBeNull();
    expect(officialSlug(undefined)).toBeNull();
  });

  test("a card reads from the catalogue, in the reader's language", () => {
    const italian = localizeCard(tIt, card);
    expect(italian.title).toBe("Signal Navigator");
    expect(italian.summary).toBe(it.official["signal-navigator"].summary);
    expect(italian.content_warning).toBe(
      it.official["signal-navigator"].contentWarning
    );
    expect(localizeCard(tEn, card).summary).toBe(card.summary);
    // nothing else of the card moves, and the stored card is not written to
    expect(italian).toMatchObject({ slug: card.slug, visibility: "official" });
    expect(card.content_warning).toBe("stored warning");
  });

  test("a person's copy of an official protocol is shown as stored", () => {
    const copy = { ...card, visibility: "workspace" };
    expect(localizeCard(tIt, copy)).toBe(copy);
  });

  test("a slug or a text the catalogue does not know falls back to the stored one", () => {
    const unknown = { ...card, slug: "brand-new", description: "Stored." };
    expect(localizeCard(tIt, unknown)).toEqual(unknown);
    expect(blockLabel(tIt, "signal-navigator", "no_such_block", "Stored")).toBe(
      "Stored"
    );
    // an absent text stays absent, even where the catalogue has words for it
    expect(localizeCard(tIt, { ...card, summary: null }).summary).toBeNull();
  });

  test("a block's label goes by its id, shared by every loop copy", () => {
    expect(blockLabel(tIt, "emotion-video", "clip_rating", "x")).toBe(
      it.official["emotion-video"].blocks.clip_rating.label
    );
    expect(blockIdOfStep({ id: "clip_rating~1" })).toBe("clip_rating");
    expect(blockIdOfStep({ id: "clip_video~0__post" })).toBe("clip_video");
    expect(blockIdOfStep({ id: "x~1~0", block: { block_id: "inner" } })).toBe(
      "inner"
    );
  });

  test("a config is copied with its display strings replaced, the rest untouched", () => {
    const tree = template("signal-navigator") as {
      root: { children: { id: string; config: Record<string, unknown> }[] };
    };
    const rule = tree.root.children.find((node) => node.id === "rule")!;
    const before = structuredClone(rule.config);
    const shown = localizeConfig(
      tIt,
      "signal-navigator",
      "rule",
      rule.config
    ) as {
      lines: { text: string; marker?: string; holdMs: number }[];
      advance: Record<string, unknown>;
    };
    const keys = it.official["signal-navigator"].blocks.rule.config;
    expect(shown.lines.map((line) => line.text)).toEqual([
      keys.lines[0].text,
      keys.lines[1].text,
      keys.lines[2].text,
      keys.lines[3].text,
    ]);
    expect(shown.lines.map((line) => line.marker)).toEqual([
      undefined,
      "rule_instruction_shown",
      "rule_instruction_shown",
      "rule_instruction_shown",
    ]);
    expect(shown.lines.map((line) => line.holdMs)).toEqual([
      4000, 6000, 5000, 5000,
    ]);
    expect(shown.advance).toEqual({
      mode: "either",
      minMs: 15000,
      maxMs: 30000,
      label: keys.advance.label,
    });
    expect(rule.config).toEqual(before);
  });

  test("a config with nothing to replace comes back as it is", () => {
    const config = { variant: "simple", markers: { outcome: "x_outcome" } };
    expect(localizeConfig(tIt, "signal-navigator", "challenge_a", config)).toBe(
      config
    );
    const english = { lines: [{ text: "Typed by an admin since." }] };
    expect(
      localizeConfig(tIt, "signal-navigator", "no_such_block", english)
    ).toBe(english);
  });

  test("a plan step: the block's label and config, an inserted rest's label only", () => {
    const plan = resolvePlan(template("emotion-video"), 3, {
      id: "p",
      version: 1,
      title: "Emotion video",
    });
    const rating = plan.steps.find((step) => step.id === "clip_rating~0")!;
    const keys = it.official["emotion-video"].blocks;
    expect(localizeStep(tIt, "emotion-video", rating)).toMatchObject({
      id: "clip_rating~0",
      label: keys.clip_rating.label,
      config: { instrument: "sam", prompt: keys.clip_rating.config.prompt },
      block: rating.block,
    });
    const rest = plan.steps.find((step) => step.id === "clip_video~0__post")!;
    const shown = localizeStep(tIt, "emotion-video", rest);
    expect(shown.label).toBe(keys.clip_video.label);
    expect(shown.config).toBe(rest.config);
    // English is the stored text: nothing changes, so nothing is copied
    expect(localizeStep(tEn, "emotion-video", rating)).toBe(rating);
  });

  test("the manifest's warning and consent text", () => {
    const manifest = {
      content_warning: "stored",
      requires_consent: true,
      consent_text: "Stored consent.",
    };
    expect(localizeManifest(tIt, "signal-navigator", manifest)).toEqual({
      content_warning: it.official["signal-navigator"].contentWarning,
      requires_consent: true,
      // no official protocol has a consent text yet: the stored one is shown
      consent_text: "Stored consent.",
    });
    expect(
      localizeManifest(tIt, "resting-baseline", {
        content_warning: null,
        consent_text: null,
      })
    ).toEqual({ content_warning: null, consent_text: null });
  });

  test("the outline is matched to the tree's top-level nodes, a loop by its own id", () => {
    const definition = template("emotion-video");
    const outline = [
      { kind: "baseline", label: "Resting baseline", count: 1, duration_s: 60 },
      { kind: "group", label: "Clips", count: 2, duration_s: 300 },
      { kind: "baseline", label: "Resting baseline", count: 1, duration_s: 60 },
    ];
    const keys = it.official["emotion-video"];
    expect(
      localizeOutline(tIt, "emotion-video", definition, outline).map(
        (item) => item.label
      )
    ).toEqual([
      keys.blocks.baseline_pre.label,
      keys.groups.clips.label,
      keys.blocks.baseline_post.label,
    ]);
    // an outline of another version, or no tree at all: as stored
    expect(
      localizeOutline(tIt, "emotion-video", definition, outline.slice(1))
    ).toEqual(outline.slice(1));
    expect(localizeOutline(tIt, "emotion-video", null, outline)).toEqual(
      outline
    );
  });

  test("a detail: the card's texts and the outline; the tree is not touched", () => {
    const definition = template("resting-baseline");
    const detail = {
      slug: "resting-baseline",
      visibility: "official",
      title: "Resting baseline",
      summary: "One minute eyes open, one minute eyes closed.",
      description: "stored description",
      content_warning: null,
      definition: definition as Record<string, unknown>,
      outline: [
        { kind: "instructions", label: "Get ready", count: 1, duration_s: 8 },
        { kind: "baseline", label: "Eyes open", count: 1, duration_s: 60 },
        { kind: "baseline", label: "Eyes closed", count: 1, duration_s: 60 },
      ],
    };
    const shown = localizeDetail(tIt, detail);
    const keys = it.official["resting-baseline"];
    expect(shown.title).toBe(keys.title);
    expect(shown.description).toBe(keys.description);
    expect(shown.content_warning).toBeNull();
    expect(shown.outline.map((item) => item.label)).toEqual([
      keys.blocks.intro.label,
      keys.blocks.eyes_open.label,
      keys.blocks.eyes_closed.label,
    ]);
    expect(shown.definition).toBe(detail.definition);
    expect(shown.definition).toEqual(template("resting-baseline"));
    const mine = { ...detail, visibility: "workspace" };
    expect(localizeDetail(tIt, mine)).toBe(mine);
  });
});

describe("hooks", () => {
  // Braces on purpose: `mockReset()` returns the mock, and a function returned from
  // `beforeEach` is run by vitest as that test's teardown.
  beforeEach(() => {
    get.mockReset();
  });
  afterEach(() => cleanup());

  // One client per test, made outside the component: a client made during render
  // would be a new cache on every render.
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="it" messages={it}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );

  test("useOfficialTexts is the identity without a slug", () => {
    const { result } = renderHook(() => useOfficialTexts(), { wrapper });
    const step = { id: "intro", label: "Get ready", config: {} };
    expect(result.current.step(null, step)).toBe(step);
    expect(result.current.title(undefined, "Mine")).toBe("Mine");
    expect(result.current.blockLabel(null, "intro", "Get ready")).toBe(
      "Get ready"
    );
    expect(result.current.blockLabel("resting-baseline", "intro", "x")).toBe(
      it.official["resting-baseline"].blocks.intro.label
    );
  });

  test("useSessionProtocol: the slug and stored title of an official protocol", async () => {
    get.mockResolvedValue({
      slug: "resting-baseline",
      visibility: "official",
      title: "Resting baseline",
    });
    const { result } = renderHook(() => useSessionProtocol("p1"), { wrapper });
    expect(result.current).toBeUndefined();
    await waitFor(() =>
      expect(result.current).toEqual({
        slug: "resting-baseline",
        title: "Resting baseline",
      })
    );
    expect(get).toHaveBeenCalledWith("protocols/p1");
  });

  test("useSessionProtocol: null for a person's protocol, a missing one, or none", async () => {
    get.mockResolvedValue({
      slug: "mine",
      visibility: "workspace",
      title: "M",
    });
    const own = renderHook(() => useSessionProtocol("p2"), { wrapper });
    await waitFor(() => expect(own.result.current).toBeNull());

    get.mockRejectedValue(new Error("404"));
    const gone = renderHook(() => useSessionProtocol("p3"), { wrapper });
    await waitFor(() => expect(gone.result.current).toBeNull());

    get.mockClear();
    const none = renderHook(() => useSessionProtocol(null), { wrapper });
    expect(none.result.current).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  test("useRecordingTitle: only a run still titled after an official protocol", async () => {
    get.mockResolvedValue([
      {
        slug: "resting-baseline",
        visibility: "official",
        title: "Resting baseline",
      },
      { slug: "mine", visibility: "workspace", title: "My protocol" },
    ]);
    const { result } = renderHook(() => useRecordingTitle(), { wrapper });
    const run = { title: "Resting baseline", session_id: "s1" };
    // as stored until the catalog is known
    expect(result.current(run)).toBe("Resting baseline");
    await waitFor(() =>
      expect(result.current(run)).toBe(it.official["resting-baseline"].title)
    );
    // an uploaded file titled by hand, a renamed run, a run of one's own protocol
    expect(result.current({ title: "Resting baseline" })).toBe(
      "Resting baseline"
    );
    expect(result.current({ title: "Monday", session_id: "s2" })).toBe(
      "Monday"
    );
    expect(result.current({ title: "My protocol", session_id: "s3" })).toBe(
      "My protocol"
    );
  });

  test("useRecordingTitle shows stored titles when the catalog cannot be read", async () => {
    get.mockResolvedValue({ unexpected: true });
    const { result } = renderHook(() => useRecordingTitle(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current({ title: "Resting baseline", session_id: "s" })).toBe(
      "Resting baseline"
    );
  });
});
