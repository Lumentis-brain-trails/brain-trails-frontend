"use client";

/**
 * "Make a protocol" on a media item: wraps it in a one-block draft and opens it
 * (backend V3-0004 amendment). The draft is filed in the workspace being worked in,
 * a clinic's included, and the button waits until that workspace is known - before it
 * is, the API would file the draft in the personal library (frontend #142).
 */
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ApiRequestError, api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import type { ProtocolDetail } from "@/lib/protocol/catalog";
import type { Media } from "@/lib/types";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import { Button, ErrorBanner } from "@/components/ui";

const WRAPPABLE = new Set(["video", "audio", "text"]);

/** Turn one item into a protocol draft and open it (V3-0004 amendment). */
export function MakeProtocol({ item }: { item: Media }) {
  const t = useTranslations("media.page");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  // The protocol goes to the library being worked in, a clinic's included.
  const workspace = useCurrentWorkspace();
  const create = useMutation({
    mutationFn: () =>
      api.post<ProtocolDetail>(
        inWorkspace(`protocols/from-media/${item.id}`, workspace),
        {}
      ),
    onSuccess: (protocol) => router.push(`/protocols/${protocol.id}`),
  });
  if (!WRAPPABLE.has(item.kind) || item.status !== "ready") return null;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending || workspace === undefined}
        >
          {t("createProtocol")}
        </Button>
      </div>
      {create.error instanceof ApiRequestError && (
        <ErrorBanner message={errorMessage(create.error)} />
      )}
    </div>
  );
}
