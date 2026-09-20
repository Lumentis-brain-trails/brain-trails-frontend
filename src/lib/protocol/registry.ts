/**
 * The task-kind registry.
 *
 * Adding a protocol is data; adding a *kind* is one file plus one registration. The
 * registry is also what the protocol schema validates against, so a definition naming an
 * unknown kind fails at parse time with the known names listed rather than at the moment
 * the participant reaches that step.
 */

import type { TaskKind } from "./types";

const kinds = new Map<string, TaskKind<never>>();

export function registerTaskKind<C>(kind: TaskKind<C>): void {
  if (kinds.has(kind.name)) {
    throw new Error(`registerTaskKind: "${kind.name}" is already registered`);
  }
  kinds.set(kind.name, kind as unknown as TaskKind<never>);
}

export function getTaskKind(name: string): TaskKind<never> {
  const kind = kinds.get(name);
  if (!kind) {
    throw new Error(
      `getTaskKind: unknown task kind "${name}"; registered kinds are ${knownKinds().join(", ") || "(none)"}`
    );
  }
  return kind;
}

export function hasTaskKind(name: string): boolean {
  return kinds.has(name);
}

export function knownKinds(): string[] {
  return [...kinds.keys()].sort();
}

/** Test seam: drop every registration. Not used by application code. */
export function resetRegistry(): void {
  kinds.clear();
}
