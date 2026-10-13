/**
 * The builder's own check of a draft, and where a finding points.
 *
 * The server's validation is the authority (media, durations, the whole tree); this is
 * the part of it the browser can do at once with what it has: every block's config
 * against its kind's zod schema, the one the runner parses with. Preview and Publish run
 * it first, so Preview never opens on a plan that cannot run (it used to say "nothing
 * to preview") and the author is pointed at the field instead (2026-09-24: two timed
 * instructions without a duration, one empty line).
 *
 * Findings use the server's shape and path grammar (`root/<clip>/…/config/<field>`),
 * so one list and one badge per clip draw both the server's report and this one.
 *
 * The server's messages are English and shown as they arrive. The ones written here
 * also say which sentence they are (`text`), so the list can show them in the reader's
 * language (`builder.findingText.<key>`); `message` stays the English of the same
 * sentence, for anything that reads a finding without a translator.
 */

import type { $ZodIssue } from "zod/v4/core";
import { getTaskKind, hasTaskKind } from "@/lib/protocol/registry";
import type { ProtocolTree, TreeNode } from "@/lib/protocol/tree";
import { humaniseName } from "./fields";

/** The sentences this module writes; each is a key under `builder.findingText`. */
export type FindingTextKey = "required" | "empty" | "oneOf" | "unknownKind";

/** A finding's sentence as a catalogue key and the values it is filled with. */
export interface FindingText {
  key: FindingTextKey;
  values: Record<string, string>;
}

export interface Finding {
  rule: string;
  path: string;
  /** English, in the server's words. */
  message: string;
  /** Only on findings made in the browser; the server's have a `message` alone. */
  text?: FindingText;
}

/** At most this many findings per block: enough to fix it in one pass, not a wall. */
const PER_BLOCK = 3;

/** Every block config that would not parse, in timeline order. */
export function checkTree(tree: ProtocolTree): Finding[] {
  const out: Finding[] = [];
  tree.root.children.forEach((child, index) =>
    visit(child, `root/${index}`, out)
  );
  return out;
}

function visit(node: TreeNode, path: string, out: Finding[]): void {
  if (node.type === "sequence") {
    node.children.forEach((child, i) => visit(child, `${path}/${i}`, out));
    return;
  }
  if (node.type === "loop") {
    node.template.children.forEach((child, i) =>
      visit(child, `${path}/t/${i}`, out)
    );
    return;
  }
  // A config a loop column fills in is checked by the server over a sample row.
  if (hasVar(node.config)) return;
  if (!hasTaskKind(node.kind)) {
    out.push({
      rule: "unknown_kind",
      path,
      message: `Unknown block kind "${node.kind}".`,
      text: { key: "unknownKind", values: { kind: node.kind } },
    });
    return;
  }
  const result = getTaskKind(node.kind).configSchema.safeParse(node.config);
  if (result.success) return;
  for (const issue of result.error.issues.slice(0, PER_BLOCK))
    out.push({
      rule: "config",
      path: [`${path}/config`, ...issue.path.map(String)].join("/"),
      ...explain(issue),
    });
}

function hasVar(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (
    !Array.isArray(value) &&
    typeof (value as { $var?: unknown }).$var === "string"
  )
    return true;
  return Object.values(value).some(hasVar);
}

/**
 * A zod issue in the words the server's validator uses for the same fault. A fault
 * with no sentence of its own keeps zod's message, which is English only.
 */
function explain(issue: $ZodIssue): Pick<Finding, "message" | "text"> {
  const last = issue.path[issue.path.length - 1];
  const name = String(last ?? "value");
  const quoted = JSON.stringify(name);
  if (
    issue.code === "invalid_type" &&
    /received undefined$/.test(issue.message)
  )
    return {
      message: `${quoted} is required.`,
      text: { key: "required", values: { name } },
    };
  if (
    issue.code === "too_small" &&
    issue.origin === "string" &&
    issue.minimum === 1
  )
    return {
      message: `${quoted} cannot be empty.`,
      text: { key: "empty", values: { name } },
    };
  const options = /^Invalid discriminator value\. Expected (.+)$/.exec(
    issue.message
  );
  if (options?.[1]) {
    const listed = options[1]
      .split(" | ")
      .map((option) => JSON.stringify(option.replace(/^'|'$/g, "")))
      .join(", ");
    return {
      message: `${quoted} must be one of ${listed}.`,
      text: { key: "oneOf", values: { name, options: listed } },
    };
  }
  return { message: issue.message };
}

/** Where a finding points: the clip on the timeline, and the setting inside it. */
export interface Location {
  /** Index on the timeline, or null for a finding about the protocol as a whole. */
  clip: number | null;
  /** The setting, humanised (`Advance · Duration (ms)`), or "" when it is the block. */
  where: string;
  /** `n` for a row inside a list, so the caller can say "row n" in its own words. */
  rows: number[];
}

/**
 * Parse a finding's path: `root/<clip>(/t/<i>)*(/config/<segment>...)?`, or a path
 * under `manifest`, or `root` itself.
 */
export function locate(path: string): Location {
  const parts = path.split("/").filter(Boolean);
  const clip =
    parts[0] === "root" && parts[1] !== undefined && /^\d+$/.test(parts[1])
      ? Number(parts[1])
      : null;
  const config = parts.indexOf("config");
  const tail =
    config >= 0 ? parts.slice(config + 1) : clip === null ? parts.slice(1) : [];
  const rows: number[] = [];
  const words: string[] = [];
  for (const segment of tail) {
    if (/^\d+$/.test(segment)) rows.push(Number(segment) + 1);
    else words.push(humaniseName(segment));
  }
  return { clip, where: words.join(" · "), rows };
}
