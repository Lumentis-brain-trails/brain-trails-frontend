"use client";

/**
 * Publication review (backend V3-0003, V3-0008): every item offered to the community
 * waits here during the beta. Approve puts it on the community shelf, refuse keeps it in
 * its workspace, hide takes it down. The staff app stays English (plan V3, S26).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MediaCard } from "@/components/MediaCard";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import type { Media } from "@/lib/types";

type Decision = "approve" | "refuse" | "hide";

export default function AdminReviewPage() {
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: ["admin-review"],
    queryFn: () => api.get<Media[]>("admin/review"),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: Decision }) =>
      api.post<Media>(`admin/review/media/${id}`, { decision }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-review"] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="type-title mb-1">Review</h1>
      <p className="mb-8 text-ink-2">
        Items people asked to share with the community.
      </p>
      {queue.isPending && <Spinner />}
      {queue.isError && (
        <ErrorBanner message="The queue could not be loaded." />
      )}
      {decide.error instanceof ApiRequestError && (
        <ErrorBanner message={decide.error.error.message} />
      )}
      {queue.data?.length === 0 && (
        <Card inset>
          <EmptyState title="Nothing to review." />
        </Card>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-6">
        {queue.data?.map((item) => (
          <Card key={item.id} inset className="space-y-3 p-3">
            <MediaCard item={item} />
            {item.description && (
              <p className="type-caption text-ink-2">{item.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  decide.mutate({ id: item.id, decision: "approve" })
                }
                disabled={decide.isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  decide.mutate({ id: item.id, decision: "refuse" })
                }
                disabled={decide.isPending}
              >
                Refuse
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => decide.mutate({ id: item.id, decision: "hide" })}
                disabled={decide.isPending}
              >
                Hide
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
