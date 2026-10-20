import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import type { ProtocolTree } from "@/lib/protocol/tree";
import { ELEMENTS, blockForElement, paletteItem } from "./draft";
import { KIND_IDENTITY, useKindText, usePaletteText } from "./kinds";

const provider = (locale: "en" | "it", messages: typeof en) =>
  function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  };
const english = { wrapper: provider("en", en) };
const italian = { wrapper: provider("it", it as unknown as typeof en) };

const EMPTY: ProtocolTree = {
  schema: 1,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: { type: "sequence", order: "fixed", children: [] },
  soundtrack: [],
};

test("the English catalogue names every kind as the table does", () => {
  const { result } = renderHook(() => useKindText(), english);
  for (const [kind, identity] of Object.entries(KIND_IDENTITY))
    expect(result.current(kind), kind).toEqual({
      label: identity.label,
      hint: identity.hint,
    });
  // nothing in the catalogue names a kind the table does not have
  expect(Object.keys(en.builder.kinds).sort()).toEqual(
    Object.keys(KIND_IDENTITY).sort()
  );
});

test("a kind reads in the reader's language, and Italian names every kind", () => {
  const { result } = renderHook(() => useKindText(), italian);
  expect(result.current("fixation")).toEqual({
    label: "Croce di fissazione",
    hint: "Una croce da guardare, per fermare lo sguardo prima di uno stimolo.",
  });
  // an established task name stays recognisable
  expect(result.current("go-no-go").label).toBe("Signal Navigator");
  expect(Object.keys(it.builder.kinds).sort()).toEqual(
    Object.keys(KIND_IDENTITY).sort()
  );
});

test("a kind nobody knows is named after its wire name, with no hint", () => {
  const { result } = renderHook(() => useKindText(), italian);
  expect(result.current("brand-new")).toEqual({ label: "brand-new", hint: "" });
  expect(result.current("odd.name")).toEqual({ label: "odd.name", hint: "" });
  expect(result.current("")).toEqual({ label: "", hint: "" });
});

test("the English catalogue words every item of the bin as the table does", () => {
  const { result } = renderHook(() => usePaletteText(), english);
  for (const item of ELEMENTS)
    expect(result.current(item), item.id).toEqual(item);
  expect(Object.keys(en.builder.palette).sort()).toEqual(
    ELEMENTS.map((item) => item.id).sort()
  );
  expect(Object.keys(it.builder.palette).sort()).toEqual(
    ELEMENTS.map((item) => item.id).sort()
  );
});

test("an element is added in the author's language, words on screen included", () => {
  const { result } = renderHook(() => usePaletteText(), italian);
  const source = paletteItem("instructions")!;
  const item = result.current(source);
  expect(item.label).toBe("Istruzioni");
  expect(item.config).toEqual({
    lines: [
      { text: "Spiega al partecipante cosa succede adesso.", holdMs: 2500 },
    ],
    advance: { mode: "key", label: "Continua" },
  });
  // the table itself is untouched: the next reader may be reading English
  expect(source.label).toBe("Instructions");
  expect(source.config).toMatchObject({ advance: { label: "Continue" } });

  const block = blockForElement(EMPTY, item);
  expect(block.label).toBe("Istruzioni");
  // the id is the kind's, whatever the language the block was named in
  expect(block.id).toBe("instructions");

  const cued = result.current(paletteItem("go-no-go-cued")!);
  expect(cued.label).toBe("Signal Navigator, con faro");
  expect(cued.hint).toBe(
    "Prima arriva un faro verde o rosso, che cambia la regola."
  );
  // an item without a hint of its own does not grow one
  expect(result.current(paletteItem("rest")!)).not.toHaveProperty("hint");
});
