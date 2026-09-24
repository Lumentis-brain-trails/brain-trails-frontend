"use client";

/**
 * The catalog's locks, opened and closed live (backend V3-0012).
 *
 * Which protocols a visitor may actually start depends on the room - at a fair with a
 * queue, three of them are worth it and a ten-minute one is not - so it is a decision
 * taken here, in the moment, instead of in a constant that costs a deploy. A locked
 * protocol stays listed: the catalog shows the shape of the programme without pretending
 * the content is ready.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ApiRequestError, api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
  Skeleton,
  buttonClass,
} from "@/components/ui";

// From the contract, not by hand: a hand-written card once filtered on an `archived_at`
// the API never sends, every row was dropped, and the page said "No official
// protocols yet" with nothing to lock.
type ProtocolCard = components["schemas"]["ProtocolCard"];

function minutes(seconds: number | null): string {
  return seconds ? `${Math.round(seconds / 60)} min` : "–";
}

export default function AdminProtocolsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const catalog = useQuery({
    queryKey: ["admin-protocols"],
    queryFn: () =>
      api.get<ProtocolCard[]>(
        "protocols?circle=official&include_locked=true&limit=100"
      ),
  });

  const setAccess = useMutation({
    mutationFn: ({ id, access }: { id: string; access: "open" | "locked" }) =>
      api.patch(`admin/protocols/${id}/access`, { access }),
    onSuccess: async (_data, { access }) => {
      toast("success", access === "locked" ? "Locked." : "Unlocked.");
      await queryClient.invalidateQueries({ queryKey: ["admin-protocols"] });
    },
  });

  const items = (catalog.data ?? []).filter((p) => !p.archived);
  const open = items.filter((p) => p.access === "open").length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Catalog locks</h1>
          <p className="mt-2 text-pretty text-ink-2">
            A locked protocol is still listed — people see what is coming — but
            it cannot be started. Changes take effect at once; a run already
            under way finishes.
          </p>
        </div>
        <Link href="/admin" className={buttonClass("secondary")}>
          Back to admin
        </Link>
      </div>

      {setAccess.error && (
        <div className="mb-6">
          <ErrorBanner
            message={
              setAccess.error instanceof ApiRequestError
                ? setAccess.error.error.message
                : "Could not change the lock."
            }
          />
        </div>
      )}

      <SectionTitle>
        {catalog.isLoading
          ? "Official protocols"
          : `${open} of ${items.length} can be started`}
      </SectionTitle>
      <Card inset>
        {catalog.isLoading && (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {!catalog.isLoading && items.length === 0 && (
          <p className="px-5 py-4 text-ink-3">No official protocols yet.</p>
        )}
        {items.map((item) => {
          const locked = item.access === "locked";
          const busy =
            setAccess.isPending && setAccess.variables?.id === item.id;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.title}</span>
                  {locked && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink-3">
                      locked
                    </span>
                  )}
                </span>
                <span className="type-caption block truncate text-ink-3">
                  {minutes(item.est_duration_s)} · {item.slug}
                </span>
              </span>
              <Button
                variant={locked ? "primary" : "secondary"}
                size="sm"
                disabled={busy}
                onClick={() =>
                  setAccess.mutate({
                    id: item.id,
                    access: locked ? "open" : "locked",
                  })
                }
              >
                {busy ? "…" : locked ? "Unlock" : "Lock"}
              </Button>
            </div>
          );
        })}
      </Card>
    </main>
  );
}
