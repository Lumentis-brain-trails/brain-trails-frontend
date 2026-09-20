"use client";

/**
 * The builder's schema-driven form: draws the fields of a JSON Schema and edits the
 * value immutably.
 *
 * Decision (sprint S19, task 1): forms are generated from the JSON Schema the kinds
 * export (`schemas/blocks.schema.json`) by this small renderer rather than by a generic
 * schema-form library - see `src/lib/builder/fields.ts` for the reasoning. This file
 * only draws what `describeFields` describes; every schema question is answered there.
 *
 * Contract: `onChange` receives a **new** value, never a mutation of `value`; nothing is
 * debounced here, the caller owns saving (autosave lives in the builder page). The
 * controls are plain and stable - one component type per field kind, rendered in schema
 * order - so typing never remounts an input and the caret stays where it was.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Field as FieldShell,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  blankValue,
  describeFields,
  getAtPath,
  removeAtPath,
  setAtPath,
  type Field,
  type JsonSchema,
} from "@/lib/builder/fields";

export interface SchemaFormProps {
  /** The kind's config schema (or a row schema, for a list's rows). */
  schema: JsonSchema;
  /** The config being edited; `undefined` draws an empty form. */
  value: unknown;
  /** Called with the whole new value on every keystroke. */
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

/** Set a path inside the form's value, or the value itself for an empty path. */
type SetAt = (path: string[], next: unknown) => void;
type RemoveAt = (path: string[]) => void;

export function SchemaForm({
  schema,
  value,
  onChange,
  disabled = false,
}: SchemaFormProps) {
  const fields = describeFields(schema, value);
  const set: SetAt = (path, next) =>
    onChange(path.length === 0 ? next : setAtPath(value ?? {}, path, next));
  const remove: RemoveAt = (path) =>
    onChange(path.length === 0 ? undefined : removeAtPath(value ?? {}, path));

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FieldControl
          key={field.path.join(".") || "$value"}
          field={field}
          value={getAtPath(value, field.path)}
          set={set}
          remove={remove}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface ControlProps {
  field: Field;
  value: unknown;
  set: SetAt;
  remove: RemoveAt;
  disabled: boolean;
}

function FieldControl(props: ControlProps) {
  const { field } = props;
  switch (field.kind) {
    case "boolean":
      return <BooleanControl {...props} />;
    case "number":
      return (
        <Labelled field={field}>
          <NumberControl {...props} path={field.path} />
        </Labelled>
      );
    case "enum":
      return <EnumControl {...props} />;
    case "textarea":
      return <TextControl {...props} multiline />;
    case "text":
      return <TextControl {...props} />;
    case "range":
      return <RangeControl {...props} />;
    case "list":
      return <ListControl {...props} />;
    default:
      return <UnsupportedControl {...props} />;
  }
}

/** Label + control, or the bare control for a row that is a single value. */
function Labelled({
  field,
  children,
}: {
  field: Field;
  children: React.ReactNode;
}) {
  if (!field.label) return <>{children}</>;
  const label = field.required ? `${field.label} *` : field.label;
  return (
    <FieldShell label={label} hint={field.description}>
      {children}
    </FieldShell>
  );
}

function TextControl({
  field,
  value,
  set,
  disabled,
  multiline = false,
}: ControlProps & { multiline?: boolean }) {
  const text = typeof value === "string" ? value : "";
  const onChange = (next: string) =>
    set(field.path, next === "" && !field.required ? undefined : next);
  return (
    <Labelled field={field}>
      {multiline ? (
        <Textarea
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Labelled>
  );
}

/**
 * A number input that tolerates an empty, half-typed value.
 *
 * While the input holds text that is not a number yet ("", "-", "1.") the draft is kept
 * locally and nothing is written: writing `NaN` into the config would fail validation on
 * a value the author is still typing. An empty field removes the property, so an
 * optional setting cleared here disappears instead of being stored as null.
 */
function NumberControl({
  field,
  value,
  set,
  disabled,
  path,
}: ControlProps & { path: string[] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" ? String(value) : "");
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      min={field.min}
      max={field.max}
      step={field.step}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === "") set(path, undefined);
        else if (Number.isFinite(Number(raw))) set(path, Number(raw));
      }}
    />
  );
}

function BooleanControl({ field, value, set, disabled }: ControlProps) {
  return (
    <label className="flex items-center gap-2 text-[15px] text-ink">
      <input
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        onChange={(event) => set(field.path, event.target.checked)}
      />
      <span>{field.label}</span>
    </label>
  );
}

function EnumControl({ field, value, set, disabled }: ControlProps) {
  const t = useTranslations("builder.form");
  const current = value === undefined || value === null ? "" : String(value);
  return (
    <Labelled field={field}>
      <Select
        value={current}
        disabled={disabled}
        onChange={(event) =>
          set(
            field.path,
            event.target.value === "" ? undefined : event.target.value
          )
        }
      >
        {(!field.required || current === "") && (
          <option value="">{t("none")}</option>
        )}
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </Labelled>
  );
}

/** Two numbers read as `[min, max]` - the kinds' jittered durations. */
function RangeControl(props: ControlProps) {
  const t = useTranslations("builder.form");
  const { field, value } = props;
  const pair = Array.isArray(value) ? value : [];
  const label = field.required ? `${field.label} *` : field.label;
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </legend>
      <div className="flex items-center gap-3">
        <FieldShell label={t("range_from")} className="flex-1">
          <NumberControl
            {...props}
            value={pair[0]}
            path={[...field.path, "0"]}
          />
        </FieldShell>
        <FieldShell label={t("range_to")} className="flex-1">
          <NumberControl
            {...props}
            value={pair[1]}
            path={[...field.path, "1"]}
          />
        </FieldShell>
      </div>
    </fieldset>
  );
}

/**
 * A list of rows: each row is drawn from the item schema, either as its own fields or,
 * when a row is a single value (a list of strings), as one unlabelled control.
 * A list whose length is fixed by the schema (a pair of anchors, say) gets no add or
 * remove buttons - the length is part of the contract, not the author's choice.
 */
function ListControl({ field, value, set, remove, disabled }: ControlProps) {
  const t = useTranslations("builder.form");
  const rows = Array.isArray(value) ? value : [];
  const fixed = field.min !== undefined && field.min === field.max;
  const full = field.max !== undefined && rows.length >= field.max;
  const label = field.required ? `${field.label} *` : field.label;

  return (
    <fieldset className="rounded-[var(--radius-control)] border border-hairline p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">
        {label}
      </legend>
      {rows.length === 0 && (
        <p className="type-caption text-ink-3">{t("list_empty")}</p>
      )}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li
            key={index}
            className="space-y-2 border-t border-hairline pt-3 first:border-0 first:pt-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-caption text-ink-3">
                {t("row", { index: index + 1 })}
              </span>
              {!fixed && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={t("remove_row", {
                    index: index + 1,
                    name: field.label,
                  })}
                  onClick={() => remove([...field.path, String(index)])}
                >
                  {t("remove")}
                </Button>
              )}
            </div>
            {describeFields(field.itemSchema ?? {}, row).map((sub) => (
              <FieldControl
                key={sub.path.join(".") || "$value"}
                field={{
                  ...sub,
                  path: [...field.path, String(index), ...sub.path],
                }}
                value={getAtPath(row, sub.path)}
                set={set}
                remove={remove}
                disabled={disabled}
              />
            ))}
          </li>
        ))}
      </ol>
      {!fixed && !full && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={disabled}
          aria-label={t("add_to", { name: field.label })}
          onClick={() =>
            set(
              [...field.path, String(rows.length)],
              blankValue(field.itemSchema)
            )
          }
        >
          {t("add_row")}
        </Button>
      )}
    </fieldset>
  );
}

/** What the renderer cannot draw is shown, read-only, as the JSON that is saved. */
function UnsupportedControl({ field, value }: ControlProps) {
  const t = useTranslations("builder.form");
  return (
    <FieldShell
      label={field.label || t("unsupported_label")}
      hint={t("unsupported")}
    >
      <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-[13px] text-ink-2">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </FieldShell>
  );
}
