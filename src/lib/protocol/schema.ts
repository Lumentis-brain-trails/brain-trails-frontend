/**
 * Protocol validation.
 *
 * Each step's config is validated against its own kind's schema through the registry,
 * rather than against a static union here: registering a kind must not require editing
 * this file, or "new kinds are code" quietly becomes "new kinds are code in four places".
 *
 * Failures name the step index and the kind, because a protocol definition is data and
 * the person who broke it is reading a stack trace, not this module.
 */

import { z } from "zod";
import { getTaskKind, hasTaskKind, knownKinds } from "./registry";
import type { ProtocolDefinition } from "./types";

const stepSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9_]+$/,
      "step id must be lowercase letters, digits and underscores"
    ),
  kind: z.string().min(1),
  label: z.string().min(1),
  phase: z.string().min(1).optional(),
  startMarker: z.string().max(50).optional(),
  endMarker: z.string().max(50).optional(),
  config: z.unknown(),
});

const baseSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  contentWarning: z.string().optional(),
  startMarker: z.string().max(50).optional(),
  endMarker: z.string().max(50).optional(),
  steps: z.array(stepSchema).min(1),
});

/**
 * Parse a protocol definition, validating every step's config against its kind.
 *
 * Throws on the first structural problem and reports every per-step config problem at
 * once, so fixing a definition is one pass rather than one round trip per step.
 */
export function parseProtocol(input: unknown): ProtocolDefinition {
  const base = baseSchema.parse(input);

  const issues: string[] = [];
  const ids = new Set<string>();

  base.steps.forEach((step, index) => {
    const where = `steps[${index}] ("${step.id}")`;
    if (ids.has(step.id)) issues.push(`${where}: duplicate step id`);
    ids.add(step.id);

    if (!hasTaskKind(step.kind)) {
      issues.push(
        `${where}: unknown kind "${step.kind}"; registered kinds are ${knownKinds().join(", ") || "(none)"}`
      );
      return;
    }
    const result = getTaskKind(step.kind).configSchema.safeParse(step.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path =
          issue.path.length > 0 ? `config.${issue.path.join(".")}` : "config";
        issues.push(`${where}: ${path} - ${issue.message}`);
      }
    }
  });

  if (issues.length > 0) {
    throw new Error(`invalid protocol "${base.id}":\n  ${issues.join("\n  ")}`);
  }
  return base as ProtocolDefinition;
}

/** Non-throwing variant, for callers rendering an error state instead of crashing. */
export function safeParseProtocol(
  input: unknown
): { ok: true; protocol: ProtocolDefinition } | { ok: false; error: string } {
  try {
    return { ok: true, protocol: parseProtocol(input) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
