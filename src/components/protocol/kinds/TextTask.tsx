"use client";

/**
 * A text to read: inline `body`, or a text item from the media library (`media_id`,
 * bound to `src`). The Continue button unlocks after `min_s`, so a reading block cannot
 * be clicked through before anyone could have read it.
 *
 * The text is plain: blank lines separate paragraphs and nothing is interpreted as
 * markup, because protocol content comes from other people and must never inject HTML.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { type TextConfig, textConfigSchema } from "@/lib/protocol/blocks";
import { FRAME_MS, UI_UNCERTAINTY_MS, timingMeta } from "@/lib/protocol/marker";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useFirstFrame, useLatest } from "./shared";

/** Paragraphs of a plain text: split on blank lines, trimmed, empties dropped. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function TextRenderer(ctx: TaskContext<TextConfig>) {
  const t = useTranslations("kinds");
  const { body, src, media_id, min_s } = ctx.config;
  const finish = useFinish(ctx, "text");
  const emit = useLatest(ctx.emit);
  const [text, setText] = useState<string | null>(body ?? null);
  const [failed, setFailed] = useState(false);
  const [unlocked, setUnlocked] = useState(min_s === 0);
  const media = media_id ? { media_id } : {};

  useEffect(() => {
    if (body !== undefined || !src) return;
    let cancelled = false;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((value) => !cancelled && setText(value))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [body, src]);

  const shown = text !== null;
  useFirstFrame(shown, (hostMs) =>
    emit.current(
      {
        label: "stimulus_onset",
        kind: "stimulus",
        meta: { ...media, ...timingMeta("raf", FRAME_MS) },
      },
      hostMs
    )
  );

  useEffect(() => {
    if (!shown || min_s === 0) return;
    const timer = setTimeout(() => setUnlocked(true), min_s * 1000);
    return () => clearTimeout(timer);
  }, [min_s, shown]);

  const onContinue = () => {
    emit.current({
      label: "stimulus_offset",
      kind: "stimulus",
      meta: { ...media, ...timingMeta("ui", UI_UNCERTAINTY_MS) },
    });
    finish({ read: true });
  };

  if (failed)
    return (
      <Stage>
        <p className="max-w-xl text-ink-2">{t("text.error")}</p>
        <Button onClick={() => finish({ error: true })}>
          {t("common.continue")}
        </Button>
      </Stage>
    );
  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto px-6 py-10">
      <div className="my-auto max-w-2xl space-y-4 text-left">
        {text === null ? (
          <p className="text-ink-2">{t("common.loading")}</p>
        ) : (
          paragraphs(text).map((p, i) => (
            <p
              key={i}
              className="text-lg leading-relaxed whitespace-pre-line text-ink"
            >
              {p}
            </p>
          ))
        )}
      </div>
      {shown && (
        <Button onClick={onContinue} disabled={!unlocked}>
          {t("common.continue")}
        </Button>
      )}
    </div>
  );
}

export const textTaskKind: TaskKind<TextConfig> = {
  name: "text",
  configSchema: textConfigSchema,
  Renderer: TextRenderer,
};
