"use client";

/**
 * Protocols this build ships but the catalog does not list (admin only).
 *
 * A module-backed protocol can be played only through a catalog row naming its module;
 * this list says which ones have none yet, so an admin knows what to publish.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBanner, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { PROTOCOL_MODULES } from "@/lib/protocol/definitions/signalNavigator";
import type { Media } from "@/lib/types";

export default function AdminCatalogPage() {
  const games = useQuery({
    queryKey: ["media", "game", "admin"],
    queryFn: () => api.get<Media[]>("media?kind=game&include_locked=true"),
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
      <h1 className="type-title mb-1">Catalog</h1>
      <p className="mb-8 text-ink-2">
        Protocols shipped with this build but not in the catalog. Publish one as
        an official game naming its module.
      </p>
      {games.isPending && <Spinner />}
      {games.isError && (
        <ErrorBanner message="The catalog could not be loaded." />
      )}
      {games.data && unpublished.length === 0 && (
        <Card>
          <p className="text-ink-2">
            Every shipped protocol is in the catalog.
          </p>
        </Card>
      )}
      <div className="space-y-3">
        {unpublished.map(([module, definition]) => (
          <Card key={module}>
            <h2 className="type-subhead">{definition.title}</h2>
            <p className="type-caption mt-1 text-ink-3">
              module <code>{module}</code> · {definition.steps.length} steps
            </p>
          </Card>
        ))}
      </div>
    </main>
  );
}
