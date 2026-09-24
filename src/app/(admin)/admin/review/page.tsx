"use client";

/**
 * Publication review (backend V3-0003, V3-0008): every protocol and media item offered
 * to the community waits here during the beta. Approve puts it on the community shelf,
 * refuse keeps it in its workspace, hide takes it down. A reviewer cannot open someone
 * else's workspace protocol, so each protocol comes with its description and outline:
 * this page is where they see what they approve. The staff app stays English (plan V3,
 * S26).
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
import { type ProtocolDetail, formatMinutes } from "@/lib/protocol/catalog";
import type { Media } from "@/lib/types";

type Decision = "approve" | "refuse" | "hide";
type Target = { kind: "protocols" | "media"; id: string; decision: Decision };

function Decisions({
  onDecide,
  disabled,
}: {
  onDecide: (decision: Decision) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => onDecide("approve")} disabled={disabled}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onDecide("refuse")}
        disabled={disabled}
      >
        Refuse
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => onDecide("hide")}
        disabled={disabled}
      >
        Hide
      </Button>
    </div>
  );
}

function ProtocolRequest({
  item,
  onDecide,
  disabled,
}: {
  item: ProtocolDetail;
  onDecide: (decision: Decision) => void;
  disabled: boolean;
}) {
  return (
    <Card inset className="space-y-3 p-4">
      <div className="flex gap-4">
        {item.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a known host
          <img
            src={item.cover_url}
            alt=""
            className="aspect-video w-40 shrink-0 rounded-[var(--radius-card)] border border-hairline object-cover"
          />
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{item.title}</h3>
          <p className="type-caption text-ink-3">
            version {item.current_version}
            {item.est_duration_s
              ? ` · ${formatMinutes(item.est_duration_s)}`
              : ""}
            {item.tags.length > 0 && ` · ${item.tags.join(", ")}`}
          </p>
          {(item.description ?? item.summary) && (
            <p className="mt-1 text-ink-2">
              {item.description ?? item.summary}
            </p>
          )}
        </div>
      </div>
      {item.content_warning && (
        <p className="type-caption text-ink-2">
          Content warning: {item.content_warning}
        </p>
      )}
      {item.outline.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5 text-ink-2">
          {item.outline.map((step, i) => (
            <li key={i}>
              {step.label}
              <span className="text-ink-3">
                {" — "}
                {step.kind}
                {step.count > 1 && ` ×${step.count}`}
                {step.duration_s ? `, ${formatMinutes(step.duration_s)}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Decisions onDecide={onDecide} disabled={disabled} />
    </Card>
  );
}

export default function AdminReviewPage() {
  const queryClient = useQueryClient();
  const protocols = useQuery({
    queryKey: ["admin-review", "protocols"],
    queryFn: () => api.get<ProtocolDetail[]>("admin/review/protocols"),
    retry: false,
  });
  const media = useQuery({
    queryKey: ["admin-review", "media"],
    queryFn: () => api.get<Media[]>("admin/review"),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: ({ kind, id, decision }: Target) =>
      api.post<unknown>(`admin/review/${kind}/${id}`, { decision }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-review"] }),
  });

  const empty = protocols.data?.length === 0 && media.data?.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="type-title mb-1">Review</h1>
      <p className="mb-8 text-ink-2">
        Protocols and items people asked to share with the community.
      </p>
      {(protocols.isPending || media.isPending) && <Spinner />}
      {(protocols.isError || media.isError) && (
        <ErrorBanner message="The queue could not be loaded." />
      )}
      {decide.error instanceof ApiRequestError && (
        <ErrorBanner message={decide.error.error.message} />
      )}
      {empty && (
        <Card inset>
          <EmptyState title="Nothing to review." />
        </Card>
      )}

      {!!protocols.data?.length && (
        <section className="mb-10">
          <h2 className="type-heading mb-4">Protocols</h2>
          <div className="space-y-4">
            {protocols.data.map((item) => (
              <ProtocolRequest
                key={item.id}
                item={item}
                disabled={decide.isPending}
                onDecide={(decision) =>
                  decide.mutate({ kind: "protocols", id: item.id, decision })
                }
              />
            ))}
          </div>
        </section>
      )}

      {!!media.data?.length && (
        <section>
          <h2 className="type-heading mb-4">Media</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-6">
            {media.data.map((item) => (
              <Card key={item.id} inset className="space-y-3 p-3">
                <MediaCard item={item} />
                {item.description && (
                  <p className="type-caption text-ink-2">{item.description}</p>
                )}
                <Decisions
                  disabled={decide.isPending}
                  onDecide={(decision) =>
                    decide.mutate({ kind: "media", id: item.id, decision })
                  }
                />
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
