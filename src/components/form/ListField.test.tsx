import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import { ListField } from "./ListField";

afterEach(cleanup);

function renderField(
  locale: "en" | "it",
  props: Partial<Parameters<typeof ListField>[0]> = {}
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : it}
    >
      <ListField
        label="Alcohol"
        options={["none", "weekly", "other"]}
        field={{ name: "alcohol_use" }}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

const options = () =>
  screen.getAllByRole("option").map((option) => option.textContent);

test("the options are worded from the catalogue, the empty one included", () => {
  renderField("en");
  expect(options()).toEqual([
    en.common.preferNotToAnswer,
    en.taxonomies.option.none,
    en.taxonomies.option.weekly,
    en.taxonomies.option.other,
  ]);
});

test("a code takes the wording it has in this list, found by the field's name", () => {
  renderField("it");
  expect(options()).toEqual([
    it.common.preferNotToAnswer,
    it.taxonomies.byList.alcohol_use.none,
    it.taxonomies.option.weekly,
    it.taxonomies.option.other,
  ]);
  cleanup();
  // a field registered under another name says which list it answers
  renderField("it", { field: { name: "drinks" }, list: "alcohol_use" });
  expect(options()[1]).toBe(it.taxonomies.byList.alcohol_use.none);
});

test("a caller's own wording for the empty option wins", () => {
  renderField("en", { placeholder: "Select" });
  expect(options()[0]).toBe("Select");
});

test("while the lists load the field is disabled and says so", () => {
  renderField("en", { options: undefined });
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByText(en.common.loadingOptions)).toBeInTheDocument();
});

test("choosing `other` opens the companion field, named after the question", () => {
  renderField("en", {
    value: "other",
    otherField: { name: "alcohol_use_other" },
  });
  expect(screen.getByLabelText("Alcohol: please say")).toBeInTheDocument();
});
