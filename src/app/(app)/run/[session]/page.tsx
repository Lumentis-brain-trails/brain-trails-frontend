"use client";

/**
 * The participant's window of a console run (backend V3-0007, step 1).
 *
 * Opened by `/console/[session]` and dragged to the second screen: it shows the protocol
 * and nothing else - no signal, no trail, no clock. The console owns the headband, the
 * capture and the session; this window owns the runner, which stays the only clock: it
 * stamps every marker on the EEG clock the console fitted (shifted into this window's
 * time frame, `shiftFit`) and posts the timeline to the session as a plain run does. Every
 * marker is also mirrored to the console, which re-sends the whole timeline at finish.
 *
 * `[session]` is the run's key: the name of the channel both windows share, not a
 * stimulus session id - the session opens on the console's Start, once the headband is
 * known.
 */

import { useTranslations } from "next-intl";
import { use, useEffect, useState, useSyncExternalStore } from "react";
import { ProtocolRunner } from "@/components/protocol/ProtocolRunner";
import "@/components/protocol/kinds";
import { RunSurface } from "@/components/run/RunSurface";
import {
  type ConsoleChannel,
  type RunBoot,
  commandPortFrom,
  openChannel,
  shiftFit,
  teeSink,
} from "@/lib/console/channel";
import { useFocusMode } from "@/lib/focus";
import {
  type ClockAnchor,
  type TimelineFit,
  eegAnchor,
} from "@/lib/protocol/clock";
import type { CommandPort } from "@/lib/protocol/commands";
import { type MarkerSink, createSessionSink } from "@/lib/protocol/sink";

/** One run, made when the console's boot arrives. */
interface Run {
  boot: RunBoot;
  channel: ConsoleChannel;
  sink: MarkerSink;
  anchor: ClockAnchor;
  commands: CommandPort;
}

export default function ParticipantRunPage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session: runKey } = use(params);
  const t = useTranslations("console.participant");
  useFocusMode(true);

  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof BroadcastChannel !== "undefined",
    () => true
  );
  const [run, setRun] = useState<Run | null>(null);
  const [ended, setEnded] = useState(false);

  // Opened by an effect, not during render: React may render twice, and a channel
  // opened there would be closed by the first cleanup and used by the second mount.
  useEffect(() => {
    const channel = openChannel(runKey);
    if (!channel) return;
    // The console's latest fit, already in this window's frame; read per marker.
    let fit: TimelineFit | null = null;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "fit") {
        fit = shiftFit(message.fit, message.origin, performance.timeOrigin);
      } else if (message.type === "boot") {
        const { boot } = message;
        fit = shiftFit(boot.fit, boot.origin, performance.timeOrigin);
        setRun(
          (current) =>
            current ?? {
              boot,
              channel,
              sink: teeSink(createSessionSink(boot.sessionId), (marker) =>
                channel.post({ type: "marker", marker })
              ),
              anchor: eegAnchor(
                performance.now(),
                () => fit,
                boot.firstSampleIndex
              ),
              commands: commandPortFrom(channel),
            }
        );
      }
    });
    channel.post({ type: "hello" });
    const onHide = () => channel.post({ type: "gone" });
    window.addEventListener("pagehide", onHide);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", onHide);
      channel.close();
    };
  }, [runKey]);

  if (!supported)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-ink-2">
        {t("unsupported")}
      </main>
    );

  if (ended || !run)
    return (
      <main
        data-theme="dark"
        className="flex min-h-dvh items-center justify-center bg-black px-6 text-center"
      >
        <p className={ended ? "type-heading text-ink-2" : "text-ink-2"}>
          {ended ? t("ended") : t("waiting")}
        </p>
      </main>
    );

  const { boot, channel, sink } = run;
  return (
    <RunSurface>
      <ProtocolRunner
        protocol={boot.plan}
        officialSlug={boot.officialSlug}
        warningShown={boot.warningShown}
        seed={boot.seed}
        sink={sink}
        anchor={run.anchor}
        commands={run.commands}
        onState={(state) => channel.post({ type: "state", state })}
        onFinish={(results, markers) => {
          channel.post({ type: "finished", results, markers: [...markers] });
          setEnded(true);
        }}
        onExit={(reason) => {
          channel.post({ type: "exited", reason, markers: [...sink.all()] });
          setEnded(true);
        }}
      />
    </RunSurface>
  );
}
