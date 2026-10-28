"use client";

/**
 * Publication review (backend V3-0003, V3-0008): every protocol and media item offered
 * to the community waits here during the beta. Approve puts it on the community shelf,
 * refuse keeps it in its workspace, hide takes it down. A reviewer cannot open someone
 * else's workspace protocol, so each protocol comes with its description and outline:
 * this page is where they see what they approve - the outline in the words the
 * protocol's own page will use (`protocols.detail.outline`, `protocols.kindWords`), the
 * tags by the names of the catalog's rows (`protocols.tags`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { MediaCard } from "@/components/MediaCard";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api";
import { api } from "@console/lib/product";
import { useErrorMessage } from "@/lib/errorMessage";
import type { components } from "@/lib/api-types";
import type { Media } from "@/lib/types";

type ProtocolDetail = components["schemas"]["ProtocolDetail"];

/** A length as the catalog writes it (`@/lib/protocol/catalog`, not imported: it pulls
 * in every block renderer of the runner). */
export function formatMinutes(
  seconds: number | null | undefined
): string | null {
  if (seconds == null) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 1 ? `${minutes} min` : `${Math.round(seconds)} s`;
}

type Decision = "approve" | "refuse" | "hide";
type Target = { kind: "protocols" | "media"; id: string; decision: Decision };

function Decisions({
  onDecide,
  disabled,
}: {
  onDecide: (decision: Decision) => void;
  disabled: boolean;
}) {
  const t = useTranslations("admin.review");
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => onDecide("approve")} disabled={disabled}>
        {t("approve")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onDecide("refuse")}
        disabled={disabled}
      >
        {t("refuse")}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => onDecide("hide")}
        disabled={disabled}
      >
        {t("hide")}
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
  const t = useTranslations("admin.review");
  const tOutline = useTranslations("protocols.detail.outline");
  const tKinds = useTranslations("protocols.kindWords");
  const tTags = useTranslations("protocols.tags");
  const duration = formatMinutes(item.est_duration_s);
  const tags = item.tags.map((tag) => {
    const title = `${tag}.title`;
    return tTags.has(title as never) ? tTags(title as never) : tag;
  });
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
            {t("meta", {
              version: item.current_version ?? "",
              timed: item.est_duration_s ? "yes" : "no",
              duration: duration ?? "",
              tagged: tags.length > 0 ? "yes" : "no",
              tags: tags.join(", "),
            })}
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
          {t("contentWarning", { warning: item.content_warning })}
        </p>
      )}
      {item.outline.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5 text-ink-2">
          {item.outline.map((step, i) => (
            <li key={i}>
              {step.label}
              <span className="text-ink-3">
                {" "}
                {tOutline("step", {
                  kind: tKinds.has(step.kind as never)
                    ? tKinds(step.kind as never)
                    : step.kind,
                  repeated: step.count > 1 ? "yes" : "no",
                  count: step.count,
                  timed: step.duration_s ? "yes" : "no",
                  duration: formatMinutes(step.duration_s) ?? "",
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Decisions onDecide={onDecide} disabled={disabled} />
    </Card>
  );
}

export function ReviewSection() {
  const t = useTranslations("admin.review");
  const errorMessage = useErrorMessage();
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
    <div className="max-w-4xl">
      <h2 className="type-heading mb-1">{t("title")}</h2>
      <p className="mb-8 text-ink-2">{t("intro")}</p>
      {(protocols.isPending || media.isPending) && <Spinner />}
      {(protocols.isError || media.isError) && (
        <ErrorBanner message={t("loadFailed")} />
      )}
      {decide.error instanceof ApiRequestError && (
        <ErrorBanner message={errorMessage(decide.error)} />
      )}
      {empty && (
        <Card inset>
          <EmptyState title={t("empty")} />
        </Card>
      )}

      {!!protocols.data?.length && (
        <section className="mb-10">
          <h2 className="type-heading mb-4">{t("protocols")}</h2>
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
          <h2 className="type-heading mb-4">{t("media")}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-6">
            {media.data.map((item) => (
              <Card key={item.id} inset className="space-y-3 p-3">
                <MediaCard
                  item={item}
                  // The product's card links to its library page; here the reviewer
                  // opens the file itself, in a new tab.
                  onOpen={() => {
                    if (item.url) window.open(item.url, "_blank", "noopener");
                  }}
                />
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
    </div>
  );
}
