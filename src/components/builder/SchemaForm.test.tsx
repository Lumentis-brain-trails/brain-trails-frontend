import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import messages from "../../../messages/en.json";
import { SchemaForm } from "./SchemaForm";
import type { JsonSchema } from "@/lib/builder/fields";

/** The form is controlled: the harness owns the value, as the builder page does. */
function renderForm(schema: JsonSchema, initial: unknown = {}) {
  const seen = { value: initial, changes: [] as unknown[] };
  function Harness() {
    const [value, setValue] = useState<unknown>(initial);
    return (
      <NextIntlClientProvider locale="en" messages={messages}>
        <SchemaForm
          schema={schema}
          value={value}
          onChange={(next) => {
            seen.value = next;
            seen.changes.push(next);
            setValue(next);
          }}
        />
      </NextIntlClientProvider>
    );
  }
  render(<Harness />);
  return seen;
}

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    duration_s: { type: "number", minimum: 0 },
    loops: { type: "integer", minimum: 1 },
    shuffle: { type: "boolean" },
    mode: { type: "string", enum: ["timed", "self_paced"] },
    itiMs: {
      type: "array",
      prefixItems: [{ type: "integer" }, { type: "integer" }],
      maxItems: 2,
      minItems: 2,
    },
    markers: {
      type: "object",
      properties: { onset: { type: "string" } },
    },
    cues: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, atS: { type: "number" } },
        required: ["label"],
      },
    },
    palette: { type: "array", items: { type: "string" } },
    matrix: { type: "array", items: { type: "array" } },
  },
  required: ["title"],
};

describe("SchemaForm", () => {
  afterEach(cleanup);

  test("draws one control per field, in schema order", () => {
    renderForm(SCHEMA);
    expect(screen.getByLabelText("Title *")).toBeInTheDocument();
    expect(screen.getByLabelText("Body").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Mode").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Shuffle")).toHaveAttribute(
      "type",
      "checkbox"
    );
    expect(screen.getByLabelText("Markers.Onset")).toBeInTheDocument();
  });

  test("typing in a text field keeps focus and reports a new object", () => {
    const initial = { title: "" };
    const seen = renderForm(SCHEMA, initial);
    const input = screen.getByLabelText("Title *");
    input.focus();
    fireEvent.change(input, { target: { value: "Rest" } });
    expect(seen.value).toEqual({ title: "Rest" });
    expect(seen.changes[0]).not.toBe(initial);
    expect(document.activeElement).toBe(screen.getByLabelText("Title *"));
    expect(screen.getByLabelText("Title *")).toHaveValue("Rest");
  });

  test("a discriminator select reshapes its parent for the branch chosen", () => {
    const union: JsonSchema = {
      type: "object",
      properties: {
        advance: {
          oneOf: [
            {
              type: "object",
              properties: {
                mode: { const: "timed" },
                ms: { type: "integer", default: 4000 },
              },
              required: ["mode", "ms"],
            },
            {
              type: "object",
              properties: {
                mode: { const: "key" },
                label: { type: "string", default: "Continue" },
              },
              required: ["mode"],
            },
          ],
        },
      },
    };
    const seen = renderForm(union, { advance: { mode: "key", label: "Go" } });
    fireEvent.change(screen.getByLabelText("Advance.Mode"), {
      target: { value: "timed" },
    });
    expect(seen.value).toEqual({ advance: { mode: "timed", ms: 4000 } });
    expect(screen.getByLabelText("Advance.Duration (ms)")).toHaveValue(4000);
    expect(screen.queryByLabelText("Advance.Label")).toBeNull();
  });

  test("clearing an optional text field drops the property", () => {
    const seen = renderForm(SCHEMA, { title: "a", body: "text" });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "" } });
    expect(seen.value).toEqual({ title: "a" });
  });

  test("a number field accepts an empty value without writing NaN", () => {
    const seen = renderForm(SCHEMA, { duration_s: 60 });
    const input = screen.getByLabelText("Duration (s)");
    fireEvent.change(input, { target: { value: "" } });
    expect(seen.value).toEqual({});
    expect(input).toHaveValue(null);

    fireEvent.change(input, { target: { value: "12" } });
    expect(seen.value).toEqual({ duration_s: 12 });
    expect(
      seen.changes.some((change) => JSON.stringify(change).includes("null"))
    ).toBe(false);
  });

  test("an integer field carries its bounds", () => {
    renderForm(SCHEMA);
    const input = screen.getByLabelText("Loops");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("step", "1");
  });

  test("edits a nested value without touching its siblings", () => {
    const seen = renderForm(SCHEMA, {
      title: "a",
      markers: { onset: "start", extra: "kept" },
    });
    fireEvent.change(screen.getByLabelText("Markers.Onset"), {
      target: { value: "image_onset" },
    });
    expect(seen.value).toEqual({
      title: "a",
      markers: { onset: "image_onset", extra: "kept" },
    });
  });

  test("a range is two numbers written into one array", () => {
    const seen = renderForm(SCHEMA, {});
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "800" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "1200" },
    });
    expect(seen.value).toEqual({ itiMs: [800, 1200] });
  });

  test("adds and removes a row of a list", () => {
    const seen = renderForm(SCHEMA, { title: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Cues" }));
    expect(seen.value).toEqual({ title: "a", cues: [{}] });

    fireEvent.change(screen.getByLabelText("Label *"), {
      target: { value: "peak" },
    });
    expect(seen.value).toEqual({ title: "a", cues: [{ label: "peak" }] });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove row 1 of Cues" })
    );
    expect(seen.value).toEqual({ title: "a", cues: [] });
  });

  test("a list of plain strings edits one unlabelled control per row", () => {
    const seen = renderForm(SCHEMA, { palette: ["red"] });
    const [input] = screen.getAllByDisplayValue("red");
    fireEvent.change(input as HTMLElement, { target: { value: "blue" } });
    expect(seen.value).toEqual({ palette: ["blue"] });
  });

  test("what cannot be drawn is shown read-only as the JSON that is saved", () => {
    renderForm(SCHEMA, { matrix: [[1, 2]] });
    expect(screen.getByText(/\[\s*\[/)).toBeInTheDocument();
    expect(
      screen.getByText(messages.builder.form.unsupported)
    ).toBeInTheDocument();
  });
});
