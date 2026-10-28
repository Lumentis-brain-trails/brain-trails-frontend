"use client";

/**
 * The remote console (plan V4 T5): a carer watches and steers a session from elsewhere.
 *
 * The same panels as the console on one machine (T1), fed by the live service
 * (`useLiveRoom`) instead of a second window: the plan with the current block, the
 * commands, live notes, the events, the headband (contact, the four channels, packets
 * lost), and what only a live room has - the session's trail as the worker draws it,
 * each block's result as it finishes, and, when the person has a brain landscape, the
 * windows placed on it (the second view).
 *
 * Several carers may watch; one at a time holds the commands (Take / Let go), and only
 * that one may switch on "pause when I lose sight": if every carer drops, the run pauses
 * at the end of its block. Connection state is the carer's to see; the participant sees
 * a quiet line between stimuli, nothing more.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useMemo, useState } from "react";
import { LandscapeSurface } from "@/components/compare/LandscapeSurface";
import {
  CommandBar,
  EventTicker,
  HeadbandPanel,
  LiveNotes,
  PlanTimeline,
} from "@/components/console/ConsolePanels";
import { BlockResults, LiveTrail } from "@/components/live/LiveTrail";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Segmented,
  Spinner,
  buttonClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { saveLiveNote } from "@/lib/console/notes";
import { useFeature } from "@/lib/features";
import { holdsCommands } from "@/lib/live/room";
import { useLiveRoom } from "@/lib/live/useLiveRoom";
import { EEG_CHANNELS } from "@/lib/muse/protocol";
import type { ChannelQuality } from "@/lib/muse/quality";
import type { StimulusSession } from "@/lib/protocol/session";
import { useChartTheme, trailHexAt } from "@/lib/theme";

const UNKNOWN = { level: "unknown", stdUv: null } as ChannelQuality;

export default function RemoteConsolePage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session: sessionId } = use(params);
  const t = useTranslations("live.console");
  const remoteOn = useFeature("console_remote");
  const liveOn = useFeature("live");
  const enabled = remoteOn && liveOn;
  const live = useLiveRoom(sessionId, enabled);
  const { room } = live;
  const [view, setView] = useState<"trail" | "landscape">("trail");
  const theme = useChartTheme();

  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.get<StimulusSession>(`sessions/${sessionId}`),
    enabled,
  });
  const landscape = useQuery({
    queryKey: ["live-landscape", sessionId],
    queryFn: () =>
      api.get<BrainLandscape>(`sessions/${sessionId}/live/landscape`),
    enabled: enabled && room.hasLandscape,
    retry: false,
    staleTime: Infinity,
  });

  const labels = useMemo(() => room.plan.map((s) => s.label), [room.plan]);
  const labelOf = useMemo(
    () => Object.fromEntries(room.plan.map((s) => [s.id, s.label])),
    [room.plan]
  );
  const mine = holdsCommands(room);
  const running = room.producer === "on";
  const quality =
    room.quality?.quality ??
    Object.fromEntries(EEG_CHANNELS.map((c) => [c, UNKNOWN]));

  if (!enabled)
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState title={t("title")} text={t("unavailable")} />
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="type-caption mb-1 text-ink-3">{t("title")}</p>
          <h1 className="type-title">{session.data?.title ?? "…"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
            <span role="status" className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={
                  live.socketState === "open"
                    ? "h-2 w-2 rounded-full bg-ok"
                    : "h-2 w-2 rounded-full bg-warn"
                }
              />
              {t(`connection.${live.socketState}`)}
            </span>
            <span>{t(`producer.${room.producer ?? "none"}`)}</span>
            <span>{t("observers", { n: room.observers })}</span>
            {!room.analysed && running && <span>{t("notAnalysed")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {room.canCommand && !mine && (
            <Button
              size="sm"
              disabled={room.commander !== null || !running}
              onClick={() => live.send({ type: "take_command" })}
            >
              {room.commander ? t("heldByOther") : t("take")}
            </Button>
          )}
          {mine && (
            <>
              <label className="flex items-center gap-2 text-[14px] text-ink-2">
                <input
                  type="checkbox"
                  checked={room.pauseOnLostSight}
                  onChange={(e) =>
                    live.send({
                      type: "settings",
                      pause_on_lost_sight: e.target.checked,
                    })
                  }
                />
                {t("pauseOnLostSight")}
              </label>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => live.send({ type: "release_command" })}
              >
                {t("release")}
              </Button>
            </>
          )}
        </div>
      </header>

      {room.error && (
        <div className="mb-4">
          <ErrorBanner message={t(`errors.${room.error as "not_commander"}`)} />
        </div>
      )}
      {room.ended && room.producer === "ended" && session.data && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2">{t("ended")}</p>
          <Link
            href={`/recordings/${session.data.recording_id}`}
            className={buttonClass("secondary", "sm")}
          >
            {t("openRecording")}
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="type-subhead">{t("views.title")}</h2>
              {room.hasLandscape && landscape.data && (
                <Segmented
                  label={t("views.title")}
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "trail", label: t("views.trail") },
                    { value: "landscape", label: t("views.landscape") },
                  ]}
                />
              )}
            </div>
            {view === "landscape" && landscape.data ? (
              <LandscapeSurface
                landscape={landscape.data}
                height={360}
                title={t("views.landscape")}
                trails={[
                  {
                    x: room.map.x,
                    y: room.map.y,
                    colors: room.map.x.map((_, i) =>
                      trailHexAt(
                        theme.trail,
                        i / Math.max(1, room.map.x.length - 1)
                      )
                    ),
                  },
                ]}
              />
            ) : (
              <LiveTrail
                x={room.trail.x}
                y={room.trail.y}
                final={room.trailFinal}
              />
            )}
          </Card>
          <PlanTimeline labels={labels} state={room.runner} lost={!running} />
          <Card>
            <BlockResults results={room.results} labels={labelOf} />
          </Card>
        </div>
        <div className="space-y-6">
          <CommandBar
            state={room.runner}
            disabled={!mine || !running}
            send={live.sendCommand}
          />
          {live.lastCommand && (
            <p role="status" className="type-caption -mt-4 text-ink-3">
              {t(`ack.${live.lastCommand.status as "pending"}`, {
                command: live.lastCommand.type,
              })}
            </p>
          )}
          {!mine && room.canCommand && (
            <p className="type-caption -mt-4 text-ink-3">
              {t("takeToCommand")}
            </p>
          )}
          {session.data && running && (
            <LiveNotes
              clock={live.clock}
              save={async (body, tStartS) => {
                await saveLiveNote(session.data.recording_id, {
                  body,
                  tStartS,
                });
              }}
            />
          )}
          <EventTicker
            events={room.events.map((e) => ({
              seq: e.seq,
              label: e.label,
              tS: e.tS ?? 0,
            }))}
          />
          <Card>
            <h2 className="type-subhead mb-3">{t("headband")}</h2>
            <HeadbandPanel
              quality={
                quality as Record<(typeof EEG_CHANNELS)[number], ChannelQuality>
              }
              getRecent={live.rings.recent}
              connected={running && live.socketState === "open"}
              packets={room.quality?.packets ?? 0}
              lostPackets={room.quality?.lostPackets ?? 0}
              packetRate={room.quality?.packetRate ?? 0}
            />
          </Card>
        </div>
      </div>
      {live.socketState === "connecting" && (
        <div className="mt-6 flex justify-center">
          <Spinner />
        </div>
      )}
    </main>
  );
}
