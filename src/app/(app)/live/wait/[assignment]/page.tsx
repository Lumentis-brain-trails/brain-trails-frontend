"use client";

/**
 * The waiting room of a remote session (plan V4 T5): the carer opens it for one of a
 * patient's assignments and waits there.
 *
 * Opening it is what makes the patient's Play offer it (they are told by the carer, on
 * their usual call - nothing here notifies anyone). When the patient opens the run, their
 * headband pre-flight shows here: connected or not, the headband, its battery, the
 * contact of each electrode, so both get it right before Start. Their Start opens the
 * session, the room announces it, and this page moves to the session's remote console.
 * Closing the room (or two hours) ends it.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use, useEffect, useRef, useState } from "react";
import { ContactLights } from "@/components/ContactLights";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useAppConfig, useFeature } from "@/lib/features";
import { LiveSocket, type SocketState, type Ticket } from "@/lib/live/socket";
import type { EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality } from "@/lib/muse/quality";
import type { Assignment } from "@/lib/subjects";

interface Preflight {
  status?: string;
  model?: string;
  battery?: number | null;
  quality?: Record<EegChannel, ChannelQuality>;
  allGood?: boolean;
}

export default function WaitingRoomPage({
  params,
}: {
  params: Promise<{ assignment: string }>;
}) {
  const { assignment } = use(params);
  const t = useTranslations("live.wait");
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const remoteOn = useFeature("console_remote");
  const liveOn = useFeature("live");
  const config = useAppConfig();
  const baseUrl = config.data?.live_url ?? null;
  const enabled = remoteOn && liveOn && Boolean(baseUrl);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [patientHere, setPatientHere] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const socketRef = useRef<LiveSocket | null>(null);
  // read when the session starts, not a reason to reopen the room
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const item = useQuery({
    queryKey: ["assignment", assignment],
    queryFn: () => api.get<Assignment>(`assignments/${assignment}`),
    enabled,
  });

  useEffect(() => {
    if (!enabled || !baseUrl) return;
    const socket = new LiveSocket({
      baseUrl,
      // opening an open room again only hands out a new ticket
      ticket: () =>
        api
          .post<Ticket>(`assignments/${assignment}/live-room`, {})
          .catch((e) => {
            setFailed(e);
            throw e;
          }),
      onFrame: (frame) => {
        if (frame.type === "hello" && frame.preflight) {
          setPreflight(frame.preflight as Preflight);
          setPatientHere(true);
        }
        if (frame.type === "preflight") {
          setPreflight(frame.preflight as Preflight);
          setPatientHere(true);
        }
        if (frame.type === "patient" && frame.present === false)
          setPatientHere(false);
        const started =
          frame.type === "session" ||
          (frame.type === "hello" && frame.session_id);
        if (started && typeof frame.session_id === "string")
          routerRef.current.push(`/live/${frame.session_id}`);
      },
      onState: setSocketState,
    });
    socketRef.current = socket;
    socket.start();
    return () => socket.close();
  }, [assignment, baseUrl, enabled]);

  const close = useMutation({
    mutationFn: () => api.delete(`assignments/${assignment}/live-room`),
    onSuccess: () => {
      socketRef.current?.close();
      router.push(
        item.data ? `/patients/${item.data.subject_id}` : "/patients"
      );
    },
  });

  if (!enabled)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState title={t("title")} text={t("unavailable")} />
      </main>
    );

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="type-caption mb-1 text-ink-3">{t("title")}</p>
      <h1 className="type-title mb-2">{item.data?.protocol_title ?? "…"}</h1>
      <p className="mb-6 text-ink-2">{t("intro")}</p>
      {failed !== null && (
        <div className="mb-4">
          <ErrorBanner message={errorMessage(failed)} />
        </div>
      )}
      <Card className="mb-6 space-y-4">
        <p role="status" className="flex items-center gap-2 text-ink">
          {socketState === "open" ? (
            <span
              aria-hidden
              className={
                patientHere
                  ? "h-2 w-2 rounded-full bg-ok"
                  : "h-2 w-2 animate-pulse rounded-full bg-warn"
              }
            />
          ) : (
            <Spinner className="h-3 w-3" />
          )}
          {socketState !== "open"
            ? t("opening")
            : patientHere
              ? t("patientHere")
              : t("patientAway")}
        </p>
        {preflight && patientHere && (
          <div className="space-y-3">
            <p className="text-[14px] text-ink-2">
              {preflight.status === "connected"
                ? t("headbandOn", {
                    model: preflight.model ?? "Muse",
                    battery: preflight.battery ?? "—",
                  })
                : t("headbandOff")}
            </p>
            {preflight.quality && (
              <ContactLights
                quality={preflight.quality}
                active={preflight.status === "connected"}
              />
            )}
            {preflight.allGood && (
              <p className="text-[14px] text-ok">{t("contactGood")}</p>
            )}
          </div>
        )}
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="ghost"
          disabled={close.isPending}
          onClick={() => close.mutate()}
        >
          {t("close")}
        </Button>
        {item.data && (
          <Link
            href={`/patients/${item.data.subject_id}`}
            className="pressable self-center text-[14px] text-ink-3"
          >
            {t("back")}
          </Link>
        )}
      </div>
    </main>
  );
}
