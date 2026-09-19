"use client";

/**
 * The protocols a participant can run.
 *
 * Rows come from the media catalog, because that is what a session can be started
 * against: `POST /sessions` takes a `media_id` and nothing else identifies a run. Each
 * game row names a `module` this build resolves to a shipped protocol definition.
 *
 * The code-shipped modules are still listed, marked as unpublished, so a protocol that
 * exists in the frontend but has no catalog row is visible rather than silently missing -
 * that gap is the single most likely reason a new task cannot be started.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { buttonClass, Card, ErrorBanner, Spinner } from "@/components/ui";
import "@/components/protocol/kinds";
import { api } from "@/lib/api";
import {
  PROTOCOL_MODULES,
  getProtocolModule,
} from "@/lib/protocol/definitions/signalNavigator";
import { safeParseProtocol } from "@/lib/protocol/schema";
import type { Media } from "@/lib/types";

export default function ProtocolsPage() {
  const games = useQuery({
    queryKey: ["media", "game"],
    queryFn: () => api.get<Media[]>("media?kind=game"),
  });

  const published = new Set(
    (games.data ?? []).map((item) => item.module).filter(Boolean) as string[]
  );
  const unpublished = Object.entries(PROTOCOL_MODULES).filter(
    ([module, definition]) =>
      !published.has(module) && !published.has(definition.id)
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="type-title">Protocols</h1>
        <p className="mt-1 text-ink-2">
          Each protocol is a sequence of tasks and prompts that emits a timed
          marker stream.
        </p>
      </header>

      {games.isPending && <Spinner />}
      {games.isError && (
        <ErrorBanner message="The catalog could not be loaded." />
      )}

      <div className="space-y-4">
        {(games.data ?? []).map((item) => (
          <CatalogRow key={item.id} item={item} />
        ))}
      </div>

      {games.data?.length === 0 && unpublished.length === 0 && (
        <Card>
          <p className="text-ink-2">No protocols are published yet.</p>
        </Card>
      )}

      {unpublished.length > 0 && (
        <section className="mt-8">
          <h2 className="type-subhead mb-1">Not in the catalog</h2>
          <p className="type-caption mb-3 text-ink-3">
            These ship with this build but have no catalog entry, so no session
            can be recorded against them. An administrator publishes one as a
            game naming its module.
          </p>
          <div className="space-y-3">
            {unpublished.map(([module, definition]) => (
              <Card key={module}>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h3 className="type-subhead">{definition.title}</h3>
                    <p className="type-caption mt-1 text-ink-3">
                      module <code>{module}</code>
                    </p>
                  </div>
                  <Link
                    href={`/protocols/${definition.id}/run`}
                    className={buttonClass("secondary", "sm")}
                  >
                    Try without recording
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <p className="type-caption mt-8 text-ink-3">
        These tasks are not a medical assessment and do not diagnose any
        condition.
      </p>
    </main>
  );
}

function CatalogRow({ item }: { item: Media }) {
  const definition = item.module ? getProtocolModule(item.module) : undefined;
  const parsed = definition ? safeParseProtocol(definition) : null;
  const runnable = parsed?.ok === true;

  return (
    <Card>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="type-subhead">{item.title}</h2>
          <p className="type-caption mt-1 text-ink-3">
            {definition
              ? `${definition.steps.length} steps · version ${definition.version}`
              : `module ${item.module ?? "—"}`}
            {item.visibility === "official" && " · official"}
          </p>
          {definition && (
            <p className="mt-2 text-[14px] text-ink-2">
              {definition.steps.map((step) => step.label).join(" → ")}
            </p>
          )}
          {!runnable && (
            <p className="mt-2 text-[14px] text-danger">
              {parsed && !parsed.ok
                ? parsed.error
                : `This build cannot run module "${item.module ?? "—"}".`}
            </p>
          )}
        </div>
        {runnable && (
          <Link
            href={`/protocols/${definition!.id}/run?media=${item.id}`}
            className={buttonClass("primary", "sm")}
          >
            Start
          </Link>
        )}
      </div>
    </Card>
  );
}
