"use client";

/**
 * One sound on the lane, edited from the side panel (backend V3-0014).
 *
 * Everything the lane's drags do can be done here with the keyboard: when it starts,
 * with what delay, when it stops, whether it loops, how loud. The one combination the
 * validator refuses - a loop that stops "when the sound ends", which it never does - is
 * made impossible rather than reported.
 */
import { useTranslations } from "next-intl";
import { Button, Field, Input, Select } from "@/components/ui";
import type { BinMedia } from "@/lib/builder/draft";
import type { Cue } from "@/lib/protocol/tree";

export interface BlockChoice {
  id: string;
  label: string;
}

export function SoundInspector({
  cue,
  blocks,
  media,
  onChange,
  onStop,
  onDelete,
}: {
  cue: Cue;
  blocks: BlockChoice[];
  media: BinMedia | undefined;
  onChange: (patch: Partial<Cue>) => void;
  onStop: (where: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("builder.soundtrack");
  const stopValue =
    typeof cue.stop === "string" ? cue.stop : `block:${cue.stop.block}`;
  const offset = cue.start?.offset_s ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="type-eyebrow text-ink-3">{t("inspector_title")}</p>
        <p className="mt-1 truncate font-medium">
          {media?.title ?? cue.media_id}
        </p>
      </div>

      <Field label={t("label")}>
        <Input
          value={cue.label ?? ""}
          placeholder={media?.title}
          onChange={(event) =>
            onChange({ label: event.target.value || undefined })
          }
        />
      </Field>

      <Field label={t("starts")}>
        <Select
          value={cue.start?.block ?? ""}
          onChange={(event) =>
            onChange({
              start: event.target.value
                ? { block: event.target.value, offset_s: offset }
                : { offset_s: offset },
            })
          }
        >
          <option value="">{t("starts_protocol")}</option>
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {t("starts_block", { label: block.label })}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("delay")}>
        <Input
          type="number"
          min={0}
          max={3600}
          step={0.5}
          value={offset}
          onChange={(event) =>
            onChange({
              start: {
                ...(cue.start?.block ? { block: cue.start.block } : {}),
                offset_s: Math.max(0, Number(event.target.value) || 0),
              },
            })
          }
        />
      </Field>

      <Field label={t("stops")}>
        <Select
          value={stopValue}
          onChange={(event) => onStop(event.target.value)}
        >
          <option value="clip_end">{t("stops_clip")}</option>
          <option value="protocol_end">{t("stops_protocol")}</option>
          {blocks.map((block) => (
            <option key={block.id} value={`block:${block.id}`}>
              {t("stops_block", { label: block.label })}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
          checked={cue.loop ?? false}
          disabled={cue.stop === "clip_end"}
          onChange={(event) => onChange({ loop: event.target.checked })}
        />
        <span>
          <span className="block">{t("loop")}</span>
          {cue.stop === "clip_end" && (
            <span className="type-caption text-ink-3">
              {t("loop_needs_stop")}
            </span>
          )}
        </span>
      </label>

      <Field
        label={`${t("volume")} · ${Math.round((cue.volume ?? 0.6) * 100)}%`}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="w-full"
          value={cue.volume ?? 0.6}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
        />
      </Field>

      <Field label={`${t("fade")} · ${cue.fade_s ?? 1}`}>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          className="w-full"
          value={cue.fade_s ?? 1}
          onChange={(event) => onChange({ fade_s: Number(event.target.value) })}
        />
      </Field>

      <p className="type-caption text-pretty text-ink-3">{t("note")}</p>

      <Button variant="secondary" onClick={onDelete}>
        {t("remove")}
      </Button>
    </div>
  );
}
