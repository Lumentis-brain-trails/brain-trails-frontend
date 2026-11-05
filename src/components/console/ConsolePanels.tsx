"use client";

/**
 * The operator console's panels (backend V3-0007, step 1): the command bar, the plan as
 * a timeline with the current block, the live notes, the event ticker and the headband
 * (contact, the four channels, packets lost).
 *
 * Panels read props, never the channel: what feeds them is the console page's business,
 * so the remote console (plan V4, T5) can feed the same panels from the live service.
 */

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Button, Card, Input, Textarea, cn } from "@/components/ui";
import {
  type CommandType,
  EXTEND_REST_S,
  MESSAGE_MAX_CHARS,
  type RunnerState,
} from "@/lib/protocol/commands";
import { NOTE_MAX_CHARS } from "@/lib/console/notes";
import { ContactLights } from "@/components/ContactLights";
import type { EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality } from "@/lib/muse/quality";

/** The command bar. `send` asks the runner; what it did comes back as state and events. */
export function CommandBar({
  state,
  disabled,
  send,
}: {
  state: RunnerState | null;
  disabled: boolean;
  send: (type: CommandType, text?: string) => void;
}) {
  const t = useTranslations("console.commands");
  const [text, setText] = useState("");
  const [confirmAbort, setConfirmAbort] = useState(false);
  // The block an End or Skip was sent for: both stay off until the runner reports a
  // different block, so a double click cannot end two.
  const [endedIndex, setEndedIndex] = useState<number | null>(null);
  const paused = state?.status === "paused";
  const pending = state?.pausePending === true;
  const inBlock = state?.status === "running";
  const ending = endedIndex !== null && state?.stepIndex === endedIndex;
  const end = (type: "end_block" | "skip_block") => {
    if (!state || ending) return;
    setEndedIndex(state.stepIndex);
    send(type);
  };
  // A Repeat stays off until the runner reports the new attempt, for the same reason.
  const [repeatedAt, setRepeatedAt] = useState<string | null>(null);
  const attemptKey = state ? `${state.stepIndex}#${state.attempt}` : null;
  const repeating = repeatedAt !== null && repeatedAt === attemptKey;
  const repeat = () => {
    if (!state || repeating || ending) return;
    setRepeatedAt(attemptKey);
    send("repeat_block");
  };

  return (
    <Card>
      <h2 className="type-subhead mb-3">{t("title")}</h2>
      <div className="flex flex-wrap gap-2">
        {paused || pending ? (
          <Button disabled={disabled} onClick={() => send("resume")}>
            {t("resume")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={disabled || !inBlock}
            onClick={() => send("pause")}
          >
            {t("pause")}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={disabled || !inBlock || ending}
          onClick={() => end("end_block")}
        >
          {t("endBlock")}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !inBlock || ending}
          onClick={() => end("skip_block")}
        >
          {t("skipBlock")}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !inBlock || ending || repeating}
          onClick={repeat}
        >
          {t("repeatBlock")}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !inBlock || !state?.extendable}
          onClick={() => send("extend_rest")}
        >
          {t("extendRest", { s: EXTEND_REST_S })}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => send("flag")}
        >
          {t("flag")}
        </Button>
        {confirmAbort ? (
          <>
            <Button
              variant="danger"
              disabled={disabled}
              onClick={() => {
                setConfirmAbort(false);
                send("abort");
              }}
            >
              {t("abortConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmAbort(false)}>
              {t("abortCancel")}
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => setConfirmAbort(true)}
          >
            {t("abort")}
          </Button>
        )}
      </div>
      {pending && (
        <p className="type-caption mt-3 text-ink-3">{t("pausePending")}</p>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          send("message", text);
          setText("");
        }}
      >
        <Input
          aria-label={t("messageLabel")}
          placeholder={t("messagePlaceholder")}
          maxLength={MESSAGE_MAX_CHARS}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || !text.trim()}
        >
          {t("send")}
        </Button>
      </form>
    </Card>
  );
}

/** The plan as a list, the current block marked; done blocks fade. */
export function PlanTimeline({
  labels,
  state,
  lost = false,
}: {
  labels: string[];
  state: RunnerState | null;
  /** The participant's window is gone: the last state reported is not the run's. */
  lost?: boolean;
}) {
  const t = useTranslations("console.plan");
  const current = state?.stepIndex ?? -1;
  const status = lost
    ? t("lost")
    : state === null
      ? t("notStarted")
      : state.status === "paused"
        ? t("paused")
        : state.status === "warning"
          ? t("waitingForParticipant")
          : state.pausePending
            ? t("pausePending")
            : t("running");
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="type-subhead">{t("title")}</h2>
        <span className="type-caption text-ink-3">{status}</span>
      </div>
      <ol className="space-y-1">
        {labels.map((label, index) => (
          <li
            key={index}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex gap-3 rounded-[var(--radius-control)] px-3 py-1.5 text-[14px]",
              index === current && "bg-accent-soft font-medium text-ink",
              index < current && "text-ink-3",
              index > current && "text-ink-2"
            )}
          >
            <span className="w-6 shrink-0 text-right tabular-nums">
              {index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The notes box. The second the operator starts typing into an empty box is the
 * note's time (`clock()`), not the second they save it.
 */
export function LiveNotes({
  clock,
  save,
}: {
  /** Seconds on the session clock now; null before the clock exists. */
  clock: () => number | null;
  save: (body: string, tStartS: number) => Promise<void>;
}) {
  const t = useTranslations("console.notes");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [failed, setFailed] = useState(false);
  const startedAt = useRef<number | null>(null);

  const submit = async () => {
    const at = startedAt.current;
    if (!body.trim() || at === null) return;
    setSaving(true);
    setFailed(false);
    try {
      await save(body, at);
      setBody("");
      startedAt.current = null;
      setSaved((n) => n + 1);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="type-subhead mb-3">{t("title")}</h2>
      <Textarea
        aria-label={t("label")}
        placeholder={t("placeholder")}
        maxLength={NOTE_MAX_CHARS}
        value={body}
        onChange={(event) => {
          const next = event.target.value;
          if (!next.trim()) startedAt.current = null;
          else if (startedAt.current === null) startedAt.current = clock();
          setBody(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="type-caption text-ink-3">
          {failed
            ? t("failed")
            : saved > 0
              ? t("saved", { count: saved })
              : t("hint")}
        </span>
        <Button
          variant="secondary"
          disabled={saving || !body.trim()}
          onClick={() => void submit()}
        >
          {t("save")}
        </Button>
      </div>
    </Card>
  );
}

/** The last events the runner stamped, newest first. */
export function EventTicker({
  events,
}: {
  events: { seq: number; label: string; tS: number }[];
}) {
  const t = useTranslations("console.events");
  return (
    <Card>
      <h2 className="type-subhead mb-3">{t("title")}</h2>
      {events.length === 0 ? (
        <p className="text-[14px] text-ink-3">{t("none")}</p>
      ) : (
        <ul className="space-y-1 font-mono text-[13px]">
          {events.map((event) => (
            <li key={event.seq} className="flex gap-3">
              <span className="w-16 shrink-0 text-right text-ink-3 tabular-nums">
                {t("seconds", { s: event.tS.toFixed(1) })}
              </span>
              <span className="text-ink-2">{event.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The headband while the run goes on: contact per electrode, the four channels as they
 * arrive, and how many packets Bluetooth lost. What the participant's EEG looks like is
 * the operator's to watch, never the participant's (their window shows the protocol
 * only).
 */
export function HeadbandPanel({
  quality,
  getRecent,
  connected,
  packets,
  lostPackets,
  packetRate,
}: {
  quality: Record<EegChannel, ChannelQuality>;
  getRecent: (seconds: number) => Record<EegChannel, Float32Array>;
  connected: boolean;
  packets: number;
  lostPackets: number;
  packetRate: number;
}) {
  const t = useTranslations("console.headbandPanel");
  const total = packets + lostPackets;
  const share = total > 0 ? lostPackets / total : 0;
  return (
    <section aria-label={t("title")} className="space-y-3">
      <ContactLights quality={quality} active={connected} />
      <LiveSignal getRecent={getRecent} active={connected} height={160} />
      <p
        className={cn(
          "type-caption tabular-nums",
          share > LOSS_WARN_SHARE ? "text-danger" : "text-ink-3"
        )}
      >
        {t("packets", {
          lost: lostPackets,
          pct: (share * 100).toFixed(1),
          rate: Math.round(packetRate),
        })}
      </p>
    </section>
  );
}

/** The chart library touches `window` when it loads: only ever in the browser. */
const LiveSignal = dynamic(
  () => import("@/components/LiveSignal").then((m) => m.LiveSignal),
  { ssr: false }
);

/** Above this share of packets lost the console shows the count in red. */
export const LOSS_WARN_SHARE = 0.02;
