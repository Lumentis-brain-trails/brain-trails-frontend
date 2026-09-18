"use client";

/**
 * The protocols a participant can run.
 *
 * Reads the code-shipped protocol modules directly. When the media catalog lands, this
 * list becomes the catalog and each row carries its `module` name; the runner below is
 * unchanged either way, because it resolves a definition and validates it the same way.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui";
import "@/components/protocol/kinds";
import { PROTOCOL_MODULES } from "@/lib/protocol/definitions/signalNavigator";
import { safeParseProtocol } from "@/lib/protocol/schema";

export default function ProtocolsPage() {
  const protocols = useMemo(
    () =>
      Object.entries(PROTOCOL_MODULES).map(([module, definition]) => ({
        module,
        definition,
        valid: safeParseProtocol(definition).ok,
      })),
    []
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Protocols</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Each protocol is a sequence of tasks and prompts that emits a timed
          marker stream.
        </p>
      </header>

      <div className="space-y-4">
        {protocols.map(({ module, definition, valid }) => (
          <Card key={module}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="font-semibold">{definition.title}</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {definition.steps.length} steps &middot; version{" "}
                  {definition.version}
                </p>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {definition.steps.map((step) => step.label).join(" → ")}
                </p>
              </div>
              {valid ? (
                <Link
                  href={`/protocols/${definition.id}/run`}
                  className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Start
                </Link>
              ) : (
                <span className="shrink-0 text-sm text-red-600">
                  Invalid definition
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        These tasks are not a medical assessment and do not diagnose any
        condition.
      </p>
    </main>
  );
}
