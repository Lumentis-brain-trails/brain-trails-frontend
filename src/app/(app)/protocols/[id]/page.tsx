"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { api } from "@/lib/api";
import { protocolFor } from "@/lib/protocol/catalog";
import { mediaAccess, type Media } from "@/lib/types";
import {
  Button,
  buttonClass,
  Card,
  ErrorBanner,
  KeyValue,
  Skeleton,
} from "@/components/ui";

const KIND_LABEL: Record<Media["kind"], string> = {
  video: "Video",
  audio: "Audio",
  text: "Text",
  quiz: "Quiz",
  game: "Game",
};

/**
 * A protocol's page (plan V3, S16): what it does, how long it takes, the blocks in
 * plain words, the content warning - then Play, which goes through the headband
 * pre-flight to the run. A locked item is shown but cannot be played.
 */
export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const item = useQuery({
    queryKey: ["media", id],
    queryFn: () => api.get<Media>(`media/${id}`),
  });

  if (item.isPending)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="aspect-video w-full rounded-[var(--radius-card)]" />
        <Skeleton className="mt-4 h-7 w-1/2" />
      </main>
    );

  if (item.isError || !item.data)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBanner message="This protocol is not in your catalog." />
        <div className="mt-6">
          <Link href="/protocols" className={buttonClass("secondary")}>
            Back to protocols
          </Link>
        </div>
      </main>
    );

  const media = item.data;
  const warning = media.manifest.content_warning;
  const protocol = protocolFor(media);
  const locked = mediaAccess(media) === "locked";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {media.kind === "video" && media.url ? (
        <video
          src={media.url}
          controls
          poster={media.cover_url ?? undefined}
          className="aspect-video w-full rounded-[var(--radius-card)] border border-hairline bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-card)] border border-hairline bg-surface-2">
          <span className="type-caption text-ink-3">
            {KIND_LABEL[media.kind]} · runs in the session page
          </span>
        </div>
      )}

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-title">{media.title}</h1>
          <p className="type-caption mt-1 text-ink-3">
            {KIND_LABEL[media.kind]}
            {media.visibility === "official"
              ? " · Official"
              : media.visibility === "public"
                ? " · Community"
                : " · Your workspace"}
          </p>
        </div>
        {locked || !protocol.ok ? (
          <Button
            disabled
            title={
              locked ? "Not open yet: beta testers get this first" : undefined
            }
          >
            {locked ? "Locked" : "Cannot play"}
          </Button>
        ) : (
          <Link href={`/protocols/${media.id}/run`} className={buttonClass()}>
            Play
          </Link>
        )}
      </header>

      {media.description && (
        <p className="mt-4 text-pretty text-ink-2">{media.description}</p>
      )}

      {protocol.ok && (
        <Card className="mt-6">
          <h2 className="text-[15px] font-semibold">What happens</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
            {protocol.protocol.steps.map((step) => (
              <li key={step.id}>{step.label}</li>
            ))}
          </ol>
          <p className="type-caption mt-3 text-ink-3">
            You wear the headband throughout; the recording starts and stops
            with the session.
          </p>
        </Card>
      )}
      {!protocol.ok && !locked && <ErrorBanner message={protocol.error} />}

      {warning && (
        <Card className="mt-6 border-warn/40 bg-warn-soft">
          <h2 className="text-[15px] font-semibold">Before you start</h2>
          <p className="mt-1 text-ink-2">{warning}</p>
          <p className="type-caption mt-2 text-ink-3">
            You can stop at any point; nothing is kept unless you finish.
          </p>
        </Card>
      )}

      <Card className="mt-6" inset>
        <KeyValue
          label="Duration"
          value={
            media.duration_s
              ? `${Math.round(media.duration_s / 60)} min`
              : media.manifest.expected_duration_s
                ? `${Math.round(media.manifest.expected_duration_s / 60)} min (expected)`
                : "–"
          }
        />
        <KeyValue
          label="Added"
          value={new Date(media.created_at).toLocaleDateString()}
        />
        {media.module && <KeyValue label="Runtime" value={media.module} />}
      </Card>
    </main>
  );
}
