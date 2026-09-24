/**
 * One kind's JSON Schema -> the flat list of fields the inspector draws.
 *
 * Decision (sprint S19, task 1): the builder's forms are generated from the JSON
 * Schema the kinds already export (`schemas/blocks.schema.json`, written by
 * `npm run schemas` from each kind's zod config schema), rendered by our own small
 * renderer. The field types in play are few - text, number, boolean, enum, a numeric
 * pair used as a range, a list of rows - and a generic schema-form library would pull
 * far more weight than it carries here, while still needing a custom widget for the
 * media pickers. No new dependency.
 *
 * This module is pure and value-aware: `value` is read only to pick the right branch of
 * a `oneOf`/`anyOf` of objects (the kinds discriminate on a `const`, e.g. go/no-go's
 * `variant`), never mutated. Whatever the schema expresses and this describer cannot
 * draw comes back as `kind: "unsupported"` so the renderer can show it read-only as
 * JSON: a config field is never silently dropped, because dropping it would quietly
 * delete an author's setting on the next save.
 *
 * The labels are derived from the property names, not translated: they are the schema's
 * own vocabulary, author-facing, and English-only like the rest of the app until S26.
 */

/** A JSON Schema object. `true`/`false` schemas are not used by the kinds. */
export type JsonSchema = Record<string, unknown>;

/** What the renderer draws for a field. `unsupported` is shown read-only as JSON. */
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "enum"
  | "range"
  | "list"
  | "unsupported";

export interface Field {
  /** Property path from the root of the config, e.g. `["markers", "cueOnset"]`. */
  path: string[];
  /** Humanised property name; nested ones are dotted, e.g. `Markers.Cue onset`. */
  label: string;
  kind: FieldKind;
  /** For `enum`: the allowed values, as strings. */
  options?: string[];
  /** For `number`/`range`: bounds. For `list`: the allowed number of rows. */
  min?: number;
  max?: number;
  step?: number;
  required: boolean;
  description?: string;
  /**
   * For `list`: the schema of one row, so the renderer can describe the row's own
   * fields (a row is an object, or a single primitive whose field has an empty path).
   */
  itemSchema?: JsonSchema;
  /**
   * For `enum`: the field is the constant a union of objects is keyed on (`mode`,
   * `variant`); changing it changes the shape of its parent, see `switchVariant`.
   */
  discriminator?: boolean;
}

/** zod exports `Number.MAX_SAFE_INTEGER` as the bound of an unbounded integer. */
const SENTINEL = Number.MAX_SAFE_INTEGER;

/** Guard against a `$ref` cycle and against a pathologically deep config. */
const MAX_DEPTH = 8;

/** Names whose string value is prose: drawn as a textarea, not a one-line input. */
const LONG_TEXT = new Set([
  "body",
  "text",
  "prompt",
  "message",
  "note",
  "notes",
  "footnote",
  "description",
  "instructions",
  "consent_text",
]);

/** Property names whose humanised form is not worth deriving token by token. */
const WHOLE_NAMES: Record<string, string> = {
  n: "Trials",
  src: "Source",
  media_id: "Media",
  atS: "Time (s)",
  // A property that is only a unit is a duration: `advance: {mode: "timed", ms: 4000}`.
  ms: "Duration (ms)",
  s: "Duration (s)",
};

/** Known abbreviations, expanded per token of a property name. */
const TOKENS: Record<string, string> = {
  id: "ID",
  iti: "Inter-trial interval",
  isi: "Inter-stimulus interval",
  nogo: "no-go",
  rt: "Reaction time",
  src: "source",
  url: "URL",
  ui: "UI",
};

/** Trailing tokens that are units, shown in parentheses. */
const UNITS: Record<string, string> = {
  s: "(s)",
  ms: "(ms)",
  hz: "(Hz)",
  px: "(px)",
};

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean";
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Follow `$ref`s (`#/$defs/...`) inside the document `root`.
 *
 * Returns the schema unchanged when the reference cannot be resolved: an unknown `$ref`
 * ends up as an `unsupported` field rather than throwing while the user types.
 */
function deref(schema: JsonSchema, root: JsonSchema, depth = 0): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/") || depth >= MAX_DEPTH)
    return schema;
  let target: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    if (!isSchema(target)) return schema;
    target = target[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return isSchema(target) ? deref(target, root, depth + 1) : schema;
}

/** Split a property name into lowercase tokens: `maxNogoRun` -> max, nogo, run. */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

/**
 * Humanise a property name: `duration_s` -> "Duration (s)", `maxRun` -> "Max run",
 * `itiMs` -> "Inter-trial interval (ms)".
 */
export function humaniseName(name: string): string {
  const whole = WHOLE_NAMES[name];
  if (whole) return whole;
  const tokens = tokenize(name);
  if (tokens.length === 0) return name;
  const unit =
    tokens.length > 1 ? UNITS[tokens[tokens.length - 1] ?? ""] : undefined;
  const words = (unit ? tokens.slice(0, -1) : tokens).map(
    (token) => TOKENS[token] ?? token
  );
  const text = words.join(" ");
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return unit ? `${capitalised} ${unit}` : capitalised;
}

/** Nested objects are flattened, so a child's label carries its parent's. */
function joinLabel(parent: string | undefined, own: string): string {
  return parent ? `${parent}.${own}` : own;
}

/** The `oneOf`/`anyOf` branches that are objects with properties of their own. */
function objectBranches(schema: JsonSchema, root: JsonSchema): JsonSchema[] {
  const raw = schema.oneOf ?? schema.anyOf;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isSchema)
    .map((branch) => deref(branch, root))
    .filter((branch) => isSchema(branch.properties));
}

/**
 * The branch the current value belongs to.
 *
 * A matching `const` (the kinds' discriminators: `variant`, `mode`) decides; failing
 * that, the branch with the most properties actually present wins, and an empty value
 * gets the first branch - a new block then starts on the kind's first variant.
 */
function pickBranch(
  branches: JsonSchema[],
  value: unknown
): JsonSchema | undefined {
  if (branches.length === 0) return undefined;
  const record = isSchema(value) ? value : {};
  let best = branches[0];
  let bestScore = -1;
  for (const branch of branches) {
    const properties = branch.properties as Record<string, unknown>;
    let score = 0;
    for (const [name, raw] of Object.entries(properties)) {
      const property = isSchema(raw) ? raw : {};
      if (property.const !== undefined && record[name] === property.const)
        score += 100;
      if (record[name] !== undefined) score += 1;
    }
    if (score > bestScore) {
      best = branch;
      bestScore = score;
    }
  }
  return best;
}

/** Every `const` a property takes across the branches: the variant's options. */
function branchConsts(branches: JsonSchema[], name: string): string[] {
  const values: string[] = [];
  for (const branch of branches) {
    const properties = branch.properties as Record<string, unknown>;
    const property = properties[name];
    if (isSchema(property) && isPrimitive(property.const)) {
      const option = String(property.const);
      if (!values.includes(option)) values.push(option);
    }
  }
  return values;
}

/**
 * Collapse a union of primitive alternatives into one schema.
 *
 * `["a", "b"]` consts become an enum, a nullable union loses its `null` branch, and a
 * union of one primitive type keeps that type without its per-branch constraints.
 * Anything else is returned untouched and ends up `unsupported`.
 */
function collapseUnion(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const raw = schema.oneOf ?? schema.anyOf;
  if (!Array.isArray(raw)) return schema;
  const branches = raw
    .filter(isSchema)
    .map((branch) => deref(branch, root))
    .filter((branch) => branch.type !== "null");
  if (branches.length === 0) return schema;
  if (branches.every((branch) => branch.const !== undefined))
    return { enum: branches.map((branch) => branch.const) };
  if (branches.length === 1) return branches[0];
  const types = new Set(branches.map((branch) => branch.type));
  const [type] = [...types];
  if (types.size === 1 && typeof type === "string") return { type };
  return schema;
}

function isNumericType(schema: JsonSchema): boolean {
  return schema.type === "number" || schema.type === "integer";
}

function isObjectLike(schema: JsonSchema, root: JsonSchema): boolean {
  return (
    schema.type === "object" ||
    isSchema(schema.properties) ||
    objectBranches(schema, root).length > 0
  );
}

/** Bounds as an input can express them, dropping zod's unbounded-integer sentinels. */
function bounds(schema: JsonSchema): Pick<Field, "min" | "max" | "step"> {
  const integer = schema.type === "integer";
  const exclusiveMin = numberOrUndefined(schema.exclusiveMinimum);
  const exclusiveMax = numberOrUndefined(schema.exclusiveMaximum);
  // HTML bounds are inclusive; an exclusive bound on a float is approximated by the
  // bound itself, and the kind's zod schema is what actually rejects the edge on save.
  let min =
    numberOrUndefined(schema.minimum) ??
    (exclusiveMin === undefined
      ? undefined
      : integer
        ? exclusiveMin + 1
        : exclusiveMin);
  let max =
    numberOrUndefined(schema.maximum) ??
    (exclusiveMax === undefined
      ? undefined
      : integer
        ? exclusiveMax - 1
        : exclusiveMax);
  if (min !== undefined && Math.abs(min) >= SENTINEL) min = undefined;
  if (max !== undefined && Math.abs(max) >= SENTINEL) max = undefined;
  return { min, max, ...(integer ? { step: 1 } : {}) };
}

/** Describe an array: a numeric pair is a range, anything row-shaped is a list. */
function describeArray(
  schema: JsonSchema,
  root: JsonSchema
): Pick<Field, "kind" | "min" | "max" | "step" | "itemSchema"> {
  const prefix = Array.isArray(schema.prefixItems)
    ? schema.prefixItems.filter(isSchema).map((item) => deref(item, root))
    : undefined;
  const items = isSchema(schema.items) ? deref(schema.items, root) : undefined;
  const minItems = numberOrUndefined(schema.minItems);
  const maxItems = numberOrUndefined(schema.maxItems);

  // `travelMs: [800, 1200]` and friends: a closed pair of numbers is a range.
  if (
    prefix?.length === 2 &&
    prefix.every(isNumericType) &&
    maxItems === 2 &&
    prefix[0] !== undefined
  )
    return { kind: "range", ...bounds(prefix[0]) };

  const sameShape =
    prefix &&
    prefix.length > 0 &&
    prefix.every((p) => p.type === prefix[0]?.type)
      ? prefix[0]
      : undefined;
  const item = items ?? sameShape;
  if (!item) return { kind: "unsupported" };
  const drawable =
    isObjectLike(item, root) ||
    item.type === "string" ||
    isNumericType(item) ||
    item.type === "boolean" ||
    Array.isArray(item.enum);
  if (!drawable) return { kind: "unsupported" };
  return { kind: "list", itemSchema: item, min: minItems, max: maxItems };
}

/** Describe one leaf property (everything but a nested object). */
function describeLeaf(
  raw: JsonSchema,
  root: JsonSchema,
  path: string[],
  label: string,
  required: boolean,
  options?: string[]
): Field {
  const schema = collapseUnion(deref(raw, root), root);
  const base: Field = {
    path,
    label,
    kind: "unsupported",
    required,
    ...(typeof schema.description === "string"
      ? { description: schema.description }
      : {}),
  };
  if (options && options.length > 0)
    return {
      ...base,
      kind: "enum",
      options: [...options],
      discriminator: true,
    };
  if (Array.isArray(schema.enum) && schema.enum.every(isPrimitive))
    return { ...base, kind: "enum", options: schema.enum.map(String) };
  if (isPrimitive(schema.const))
    return { ...base, kind: "enum", options: [String(schema.const)] };
  switch (schema.type) {
    case "string":
      return {
        ...base,
        kind:
          LONG_TEXT.has(path[path.length - 1] ?? "") &&
          schema.maxLength === undefined
            ? "textarea"
            : "text",
      };
    case "number":
    case "integer":
      return { ...base, kind: "number", ...bounds(schema) };
    case "boolean":
      return { ...base, kind: "boolean" };
    case "array":
      return { ...base, ...describeArray(schema, root) };
    default:
      return base;
  }
}

/** Walk an object schema, appending one field per drawable property. */
function collect(
  raw: JsonSchema,
  root: JsonSchema,
  value: unknown,
  path: string[],
  label: string | undefined,
  parentRequired: boolean,
  into: Field[],
  depth: number
): void {
  const schema = deref(raw, root);
  const branches = isSchema(schema.properties)
    ? []
    : objectBranches(schema, root);
  const target = isSchema(schema.properties)
    ? schema
    : (pickBranch(branches, value) ?? schema);
  const properties = target.properties;
  if (!isSchema(properties) || depth >= MAX_DEPTH) {
    into.push({
      path,
      label: label ?? "",
      kind: "unsupported",
      required: parentRequired,
    });
    return;
  }

  const required = new Set(
    (Array.isArray(target.required) ? target.required : []).filter(
      (name): name is string => typeof name === "string"
    )
  );
  const record = isSchema(value) ? value : {};

  for (const [name, rawProperty] of Object.entries(properties)) {
    if (!isSchema(rawProperty)) continue;
    const property = deref(rawProperty, root);
    const childLabel = joinLabel(label, humaniseName(name));
    const childPath = [...path, name];
    // A field the branches discriminate on: its options are the variants, so the
    // author can switch variant instead of staring at a one-value field.
    const variants =
      property.const !== undefined ? branchConsts(branches, name) : [];
    const childRequired = parentRequired && required.has(name);
    if (variants.length === 0 && isObjectLike(property, root))
      collect(
        property,
        root,
        record[name],
        childPath,
        childLabel,
        childRequired,
        into,
        depth + 1
      );
    else
      into.push(
        describeLeaf(
          property,
          root,
          childPath,
          childLabel,
          childRequired,
          variants
        )
      );
  }
}

/**
 * The fields of `schema`, in schema order, flattened over nested objects.
 *
 * `value` is the config being edited; it only selects the branch of a union of objects
 * (see `pickBranch`). A schema that is not an object - the row schema of a list of
 * strings, say - yields a single field with an empty `path`, meaning "the value
 * itself". Never throws: an unreadable corner becomes an `unsupported` field.
 */
export function describeFields(schema: JsonSchema, value: unknown): Field[] {
  if (!isSchema(schema)) return [];
  const resolved = deref(schema, schema);
  if (!isObjectLike(resolved, schema))
    return [describeLeaf(resolved, schema, [], "", true)];
  const fields: Field[] = [];
  collect(resolved, schema, value, [], undefined, true, fields, 0);
  return fields;
}

/** Read `path` out of a value; `undefined` for anything missing on the way. */
export function getAtPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isSchema(current)) current = current[segment];
    else return undefined;
    if (current === undefined) return undefined;
  }
  return current;
}

function isIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}

/**
 * `value` with `path` set to `next`, copying every container on the way.
 *
 * Immutability is the inspector's contract with the builder: the caller's `onChange`
 * always receives a new object, so autosave and undo can compare by identity. A numeric
 * segment addresses an array element and creates an array when nothing is there yet;
 * `next === undefined` removes the property (a cleared optional field must disappear
 * from the config, not be stored as `undefined`).
 */
export function setAtPath<T>(value: T, path: string[], next: unknown): T {
  if (path.length === 0) return next as T;
  const [segment, ...rest] = path as [string, ...string[]];
  const childCurrent = getAtPath(value, [segment]);
  // A missing container is created after the segment that addresses it: an index means
  // an array (the first half of a range typed before the second), a name an object.
  const childDefault: unknown =
    rest[0] !== undefined && isIndex(rest[0]) ? [] : {};
  const child =
    rest.length === 0
      ? next
      : setAtPath(childCurrent ?? childDefault, rest, next);
  if (Array.isArray(value) || (isIndex(segment) && value == null)) {
    const copy = Array.isArray(value) ? [...value] : [];
    copy[Number(segment)] = child;
    return copy as T;
  }
  const copy: Record<string, unknown> = isSchema(value) ? { ...value } : {};
  if (child === undefined) delete copy[segment];
  else copy[segment] = child;
  return copy as T;
}

/**
 * `value` with `path` removed: an array element is spliced out, an object property
 * deleted. Containers on the way are copied, like `setAtPath`.
 */
export function removeAtPath<T>(value: T, path: string[]): T {
  if (path.length === 0) return undefined as T;
  const [segment, ...rest] = path as [string, ...string[]];
  if (rest.length > 0) {
    const child = getAtPath(value, [segment]);
    if (child === undefined) return value;
    return setAtPath(value, [segment], removeAtPath(child, rest));
  }
  if (Array.isArray(value))
    return value.filter((_, index) => index !== Number(segment)) as T;
  if (!isSchema(value)) return value;
  const copy: Record<string, unknown> = { ...value };
  delete copy[segment];
  return copy as T;
}

/**
 * A blank row for a list, from its item schema: an empty object for a row of fields,
 * the empty string, zero or false for a row that is one value. Optional properties are
 * left out on purpose - the author fills what the kind asks for.
 */
export function blankValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return null;
  if (Array.isArray(schema.enum) && isPrimitive(schema.enum[0]))
    return schema.enum[0];
  switch (schema.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    default:
      return {};
  }
}

/** The schema at `path` inside `schema`, following unions by the value and arrays by index. */
function schemaAt(
  schema: JsonSchema,
  root: JsonSchema,
  value: unknown,
  path: string[]
): JsonSchema | undefined {
  let current = deref(schema, root);
  let cursor = value;
  for (const segment of path) {
    let next: unknown;
    if (isSchema(current.properties)) next = current.properties[segment];
    else {
      const branch = pickBranch(objectBranches(current, root), cursor);
      if (branch)
        next = (branch.properties as Record<string, unknown>)[segment];
    }
    if (next === undefined && current.type === "array")
      next = isSchema(current.items)
        ? current.items
        : Array.isArray(current.prefixItems)
          ? current.prefixItems[Number(segment)]
          : undefined;
    if (!isSchema(next)) return undefined;
    current = deref(next, root);
    cursor = isSchema(cursor)
      ? cursor[segment]
      : Array.isArray(cursor)
        ? cursor[Number(segment)]
        : undefined;
  }
  return current;
}

/** A schema default as a fresh value, so two rows never share one object. */
function copyOf(value: unknown): unknown {
  return value !== null && typeof value === "object"
    ? (JSON.parse(JSON.stringify(value)) as unknown)
    : value;
}

/**
 * The config after the author picks another branch of a union at `path`.
 *
 * Switching `advance.mode` from "key" to "timed" must neither leave "key"'s `label`
 * behind nor start "timed" with an empty, required `ms` (Andrea's draft, 2026-09-24:
 * two blocks failed on exactly that). The parent object is rebuilt for the new branch:
 * the discriminator set, the properties the new branch declares kept when present and
 * otherwise filled from their defaults, the old branch's own properties dropped.
 * Properties no branch declares are kept: they are the author's and the schema does not
 * speak for them. A path that leads to no union falls back to a plain set.
 */
export function switchVariant(
  schema: JsonSchema,
  value: unknown,
  path: string[],
  next: string
): unknown {
  const name = path[path.length - 1];
  if (name === undefined) return value;
  const parentPath = path.slice(0, -1);
  const parent = schemaAt(schema, schema, value, parentPath);
  const branches = parent ? objectBranches(parent, schema) : [];
  const target = branches.find((branch) => {
    const property = (branch.properties as Record<string, unknown>)[name];
    return isSchema(property) && String(property.const) === next;
  });
  if (!target) return setAtPath(value ?? {}, path, next);

  const current = getAtPath(value, parentPath);
  const record = isSchema(current) ? current : {};
  const declared = new Set(
    branches.flatMap((branch) => Object.keys(branch.properties as object))
  );
  const rebuilt: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(
    target.properties as Record<string, unknown>
  )) {
    const property = deref(isSchema(raw) ? raw : {}, schema);
    if (key === name) rebuilt[key] = property.const;
    else if (record[key] !== undefined) rebuilt[key] = record[key];
    else if (property.default !== undefined)
      rebuilt[key] = copyOf(property.default);
  }
  for (const [key, kept] of Object.entries(record))
    if (!declared.has(key)) rebuilt[key] = kept;
  return parentPath.length === 0
    ? rebuilt
    : setAtPath(value ?? {}, parentPath, rebuilt);
}
